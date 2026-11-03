import { useEffect, useState } from "react";
import { Mark } from "../components/Mark";
import { api, errorText, type EngineStatus, type ModelOption } from "../lib/api";
import { TONES, type Tone } from "../lib/modes";
import { HOTKEYS, loadPrefs, savePrefs, type Prefs } from "../lib/prefs";

const INSTALL_CMD = "curl -fsSL https://opencode.ai/install | bash";

export function Settings() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [hotkeyError, setHotkeyError] = useState("");

  const refresh = async (restart = false) => {
    setBusy(true);
    try {
      const s = await (restart ? api.restartEngine() : api.status());
      setStatus(s);
      if (s.running) setModels((await api.models()).models);
    } catch (e) {
      setStatus({ running: false, url: null, binary: null, error: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refresh();
    const onFocus = () => setPrefs(loadPrefs());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const update = (patch: Partial<Prefs>) => {
    const next = savePrefs(patch);
    setPrefs(next);
    // the storage event doesn't fire in the window that wrote it, so tell the app directly
    if ("plate" in patch) api.setPlate(next.plate).catch(() => {});
  };

  const chooseHotkey = async (accel: string) => {
    setHotkeyError("");
    try {
      await api.setHotkey(accel);
      update({ hotkey: accel });
    } catch (e) {
      setHotkeyError(`That one's taken by another app. (${errorText(e)})`);
    }
  };

  const modelKey = prefs.model ? `${prefs.model.providerID}/${prefs.model.modelID}` : "";
  const byProvider = models.reduce<Record<string, ModelOption[]>>((acc, m) => {
    (acc[m.providerName] ??= []).push(m);
    return acc;
  }, {});

  return (
    <main className="settings">
      <header className="settings-head" data-tauri-drag-region>
        <Mark size={36} />
        <div>
          <h1>unblurt</h1>
          <p>messy thoughts. clear writing.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-title">
          <h2>Engine</h2>
          <span className={`pill ${status?.running ? "ok" : "off"}`}>
            {status === null ? "checking…" : status.running ? "connected" : "offline"}
          </span>
        </div>
        <p className="muted">
          unblurt runs <b>opencode</b> quietly in the background and talks to whichever model you've connected there.
        </p>
        {status?.running && (
          <p className="mono small">
            {status.binary} · {status.url}
          </p>
        )}
        {status && !status.running && (
          <div className="callout">
            <p>{status.error}</p>
            <code onClick={() => api.copy(INSTALL_CMD)} title="click to copy">
              {INSTALL_CMD}
            </code>
            <p className="muted small">
              Then connect a provider with <code>opencode auth login</code> and hit restart.
            </p>
          </div>
        )}
        <button className="ghost" onClick={() => refresh(true)} disabled={busy}>
          {busy ? "starting…" : "restart engine"}
        </button>
      </section>

      <section className="panel">
        <h2>Model</h2>
        <select
          value={modelKey}
          onChange={(e) => {
            const m = models.find((x) => `${x.providerID}/${x.modelID}` === e.target.value);
            update({ model: m ? { providerID: m.providerID, modelID: m.modelID } : null });
          }}
          disabled={!models.length}
        >
          <option value="">opencode default</option>
          {Object.entries(byProvider).map(([provider, list]) => (
            <optgroup key={provider} label={provider}>
              {list.map((m) => (
                <option key={m.modelID} value={`${m.providerID}/${m.modelID}`}>
                  {m.modelName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="muted small">Small, fast models feel best here. Rewrites are short.</p>
      </section>

      <section className="panel">
        <h2>Shortcut</h2>
        <div className="segmented">
          {HOTKEYS.map((h) => (
            <button key={h.accel} className={prefs.hotkey === h.accel ? "on" : ""} onClick={() => chooseHotkey(h.accel)}>
              {h.label}
            </button>
          ))}
        </div>
        {hotkeyError && <p className="warn small">{hotkeyError}</p>}
        <p className="muted small">Select text anywhere, press it, hit enter. That's the whole trick.</p>
      </section>

      <section className="panel">
        <h2>Plate</h2>
        <div className="segmented">
          <button className={prefs.plate ? "on" : ""} onClick={() => update({ plate: true })}>
            show
          </button>
          <button className={!prefs.plate ? "on" : ""} onClick={() => update({ plate: false })}>
            hide
          </button>
        </div>
        <p className="muted small">
          A slim tab on the left edge of your screen. Drag selected text onto it, or click it, to open unblurt. The
          original text stays where it is.
        </p>
      </section>

      <section className="panel">
        <h2>Default tone</h2>
        <div className="segmented">
          {TONES.map((t) => (
            <button key={t.id} className={prefs.tone === t.id ? "on" : ""} onClick={() => update({ tone: t.id as Tone })}>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <footer className="settings-foot">
        <span className="muted small">v0.1.0</span>
        <button className="ghost" onClick={() => api.quit()}>
          quit unblurt
        </button>
      </footer>
    </main>
  );
}
