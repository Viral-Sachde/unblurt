//! The engine: a private `opencode serve` process that unblurt starts, owns and talks to over HTTP.
//! opencode handles providers, auth and models; unblurt only sends it one-shot rewrite prompts
//! through a tool-less agent defined in its own config file.

use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

const AGENT: &str = "unblurt";
const NOT_INSTALLED: &str =
    "opencode isn't installed (or isn't on your PATH). Install it, connect a model with `opencode auth login`, then restart the engine.";

pub struct Engine {
    http: reqwest::Client,
    data_dir: PathBuf,
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    base: Option<String>,
    binary: Option<PathBuf>,
    child: Option<Child>,
    last_error: Option<String>,
}

#[derive(Serialize)]
pub struct Status {
    running: bool,
    url: Option<String>,
    binary: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
pub struct TransformRequest {
    system: String,
    prompt: String,
    /// `{ providerID, modelID }`, passed through untouched; `None` lets opencode pick its default.
    model: Option<Value>,
}

#[derive(Serialize)]
pub struct ModelOption {
    #[serde(rename = "providerID")]
    provider_id: String,
    #[serde(rename = "providerName")]
    provider_name: String,
    #[serde(rename = "modelID")]
    model_id: String,
    #[serde(rename = "modelName")]
    model_name: String,
}

#[derive(Serialize)]
pub struct Models {
    models: Vec<ModelOption>,
    defaults: Value,
}

impl Engine {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { http: reqwest::Client::new(), data_dir, inner: Mutex::new(Inner::default()) }
    }

    async fn healthy(&self, base: &str) -> bool {
        self.http
            .get(format!("{base}/agent"))
            .timeout(Duration::from_secs(2))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    /// Returns the base URL of a healthy server, starting one if needed.
    pub async fn ensure(&self) -> Result<String, String> {
        let mut inner = self.inner.lock().await;
        if let Some(base) = inner.base.clone() {
            if self.healthy(&base).await {
                return Ok(base);
            }
        }
        let result = self.spawn(&mut inner).await;
        inner.last_error = result.as_ref().err().cloned();
        result
    }

    async fn spawn(&self, inner: &mut Inner) -> Result<String, String> {
        if let Some(mut child) = inner.child.take() {
            let _ = child.kill().await;
        }
        inner.base = None;

        let (binary, path_env) = find_opencode().ok_or(NOT_INSTALLED)?;
        inner.binary = Some(binary.clone());

        let workspace = self.data_dir.join("workspace");
        std::fs::create_dir_all(&workspace).map_err(|e| e.to_string())?;
        let config = self.data_dir.join("opencode.json");
        write_config(&config)?;

        let port = TcpListener::bind("127.0.0.1:0")
            .and_then(|l| l.local_addr())
            .map(|a| a.port())
            .map_err(|e| e.to_string())?;

        let mut cmd = Command::new(&binary);
        cmd.args(["serve", "--hostname", "127.0.0.1", "--port", &port.to_string()])
            .current_dir(&workspace)
            .env("OPENCODE_CONFIG", &config)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        if let Some(path) = path_env {
            cmd.env("PATH", path);
        }
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

        let child = cmd.spawn().map_err(|e| format!("couldn't start opencode: {e}"))?;
        inner.child = Some(child);

        let base = format!("http://127.0.0.1:{port}");
        for _ in 0..80 {
            tokio::time::sleep(Duration::from_millis(250)).await;
            if self.healthy(&base).await {
                inner.base = Some(base.clone());
                return Ok(base);
            }
        }
        Err("opencode started but never answered. Try running `opencode serve` in a terminal to see why.".into())
    }

    pub async fn restart(&self) -> Status {
        {
            let mut inner = self.inner.lock().await;
            inner.base = None;
        }
        let _ = self.ensure().await;
        self.status().await
    }

    pub async fn status(&self) -> Status {
        let _ = self.ensure().await;
        let inner = self.inner.lock().await;
        Status {
            running: inner.base.is_some(),
            url: inner.base.clone(),
            binary: inner.binary.as_ref().map(|b| b.display().to_string()),
            error: inner.last_error.clone(),
        }
    }

    pub async fn shutdown(&self) {
        if let Some(mut child) = self.inner.lock().await.child.take() {
            let _ = child.kill().await;
        }
    }

    pub async fn models(&self) -> Result<Models, String> {
        let base = self.ensure().await?;
        let v: Value = self.get_json(&format!("{base}/config/providers")).await?;
        let mut models = Vec::new();
        for p in v["providers"].as_array().into_iter().flatten() {
            let provider_id = p["id"].as_str().unwrap_or_default().to_string();
            let provider_name = p["name"].as_str().unwrap_or(&provider_id).to_string();
            for (id, m) in p["models"].as_object().into_iter().flatten() {
                models.push(ModelOption {
                    provider_id: provider_id.clone(),
                    provider_name: provider_name.clone(),
                    model_id: id.clone(),
                    model_name: m["name"].as_str().unwrap_or(id).to_string(),
                });
            }
        }
        Ok(Models { models, defaults: v["default"].clone() })
    }

    /// One rewrite = one throwaway session, so nothing leaks between requests.
    pub async fn transform(&self, req: TransformRequest) -> Result<String, String> {
        let base = self.ensure().await?;
        let session: Value = self
            .http
            .post(format!("{base}/session"))
            .json(&json!({ "title": "unblurt" }))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        let sid = session["id"].as_str().ok_or("opencode didn't create a session")?.to_string();

        let mut body = json!({
            "agent": AGENT,
            "system": req.system,
            "parts": [{ "type": "text", "text": req.prompt }],
        });
        if let Some(model) = req.model {
            body["model"] = model;
        }

        let send = self
            .http
            .post(format!("{base}/session/{sid}/message"))
            .json(&body)
            .timeout(Duration::from_secs(120))
            .send();

        // opencode retries provider failures (rate limits, quota) silently and the request just
        // hangs, so watch the session status and surface the reason instead.
        let result = tokio::select! {
            r = send => match r {
                Ok(resp) => resp.json::<Value>().await.map_err(|e| e.to_string()),
                Err(e) => Err(if e.is_timeout() { "the model took too long to answer.".into() } else { e.to_string() }),
            },
            reason = self.watch_for_retry(&base, &sid) => Err(reason),
        };

        let _ = self.http.post(format!("{base}/session/{sid}/abort")).send().await;
        let _ = self.http.delete(format!("{base}/session/{sid}")).send().await;

        let reply = result?;
        if let Some(err) = reply["info"]["error"].as_object() {
            let msg = err
                .get("data")
                .and_then(|d| d["message"].as_str())
                .or_else(|| err.get("name").and_then(|n| n.as_str()))
                .unwrap_or("the model returned an error");
            return Err(msg.to_string());
        }
        let text = reply["parts"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|p| p["type"] == "text" && p["synthetic"] != true)
            .filter_map(|p| p["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
        if text.trim().is_empty() {
            return Err("the model answered with nothing. Try again, or pick another model in settings.".into());
        }
        Ok(text)
    }

    async fn watch_for_retry(&self, base: &str, sid: &str) -> String {
        loop {
            tokio::time::sleep(Duration::from_millis(800)).await;
            let Ok(all) = self.get_json(&format!("{base}/session/status")).await else { continue };
            let s = &all[sid];
            if s["type"] != "retry" {
                continue;
            }
            let attempt = s["attempt"].as_u64().unwrap_or(1);
            // An `action` means a hard limit (quota, auth) that retrying won't fix.
            if s.get("action").is_some() || attempt >= 3 {
                let msg = s["message"].as_str().unwrap_or("the provider keeps failing");
                return match s["action"]["link"].as_str() {
                    Some(link) => format!("{msg}\n{link}\n\nOr pick a model from your own provider in settings."),
                    None => msg.to_string(),
                };
            }
        }
    }

    async fn get_json(&self, url: &str) -> Result<Value, String> {
        self.http
            .get(url)
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())
    }
}

fn write_config(path: &Path) -> Result<(), String> {
    let tools_off: serde_json::Map<String, Value> = [
        "bash", "edit", "write", "read", "grep", "glob", "list", "patch", "todowrite", "todoread", "webfetch", "task",
    ]
    .iter()
    .map(|t| (t.to_string(), Value::Bool(false)))
    .collect();
    let config = json!({
        "$schema": "https://opencode.ai/config.json",
        "share": "disabled",
        "autoupdate": false,
        "agent": {
            AGENT: {
                "description": "Rewrites text for unblurt. No tools.",
                "mode": "primary",
                "prompt": "You are unblurt, a writing assistant. You never use tools. Reply with the finished text only.",
                "temperature": 0.4,
                "tools": tools_off,
            }
        }
    });
    std::fs::write(path, serde_json::to_vec_pretty(&config).unwrap()).map_err(|e| e.to_string())
}

/// Finds the opencode binary. Apps launched from Finder/Start don't inherit the shell's PATH,
/// so this asks the user's login shell first and also returns that PATH for the child process
/// (the npm-installed `opencode` is a node script and needs `node` on PATH).
fn find_opencode() -> Option<(PathBuf, Option<String>)> {
    if let Ok(p) = std::env::var("UNBLURT_OPENCODE") {
        return Some((PathBuf::from(p), None));
    }

    #[cfg(unix)]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
        // Interactive + login so PATH tweaks in .zshrc/.bashrc (nvm, bun…) are picked up.
        // Markers make the answer findable among whatever the rc files print.
        let out = std::process::Command::new(shell)
            .args(["-ilc", "printf '\\n@@bin=%s\\n@@path=%s\\n' \"$(command -v opencode)\" \"$PATH\""])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .ok();
        let text = out.map(|o| String::from_utf8_lossy(&o.stdout).to_string()).unwrap_or_default();
        let field = |key: &str| text.lines().find_map(|l| l.strip_prefix(key)).map(str::trim).filter(|v| !v.is_empty());
        let path = field("@@path=").map(str::to_owned);
        if let Some(bin) = field("@@bin=").filter(|b| b.starts_with('/')) {
            return Some((PathBuf::from(bin), path));
        }
        let home = std::env::var("HOME").unwrap_or_default();
        let candidates = [
            format!("{home}/.opencode/bin/opencode"),
            "/opt/homebrew/bin/opencode".into(),
            "/usr/local/bin/opencode".into(),
            format!("{home}/.local/bin/opencode"),
            format!("{home}/.bun/bin/opencode"),
            format!("{home}/.npm-global/bin/opencode"),
        ];
        candidates.into_iter().map(PathBuf::from).find(|p| p.is_file()).map(|p| (p, path))
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let out = std::process::Command::new("where")
            .arg("opencode")
            .creation_flags(0x0800_0000)
            .output()
            .ok();
        if let Some(out) = out.filter(|o| o.status.success()) {
            let text = String::from_utf8_lossy(&out.stdout).to_string();
            // Prefer the real executable over npm's .cmd/.ps1 shims when both exist.
            let mut found: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
            found.sort_by_key(|l| !l.to_lowercase().ends_with(".exe"));
            if let Some(bin) = found.first() {
                return Some((PathBuf::from(bin), None));
            }
        }
        let profile = std::env::var("USERPROFILE").unwrap_or_default();
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        [
            format!("{profile}\\.opencode\\bin\\opencode.exe"),
            format!("{appdata}\\npm\\opencode.cmd"),
        ]
        .into_iter()
        .map(PathBuf::from)
        .find(|p| p.is_file())
        .map(|p| (p, None))
    }
}
