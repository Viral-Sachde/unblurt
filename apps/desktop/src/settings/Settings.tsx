import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Mark } from "../components/Mark";
import { api, errorText, type EngineStatus, type ModelOption } from "../lib/api";
import { TONES, type Tone } from "../lib/modes";
import { HOTKEYS, loadPrefs, savePrefs, type Prefs } from "../lib/prefs";
import { label as hotkeyLabel, recordFromEvent } from "../lib/hotkey";

const INSTALL_CMD = "curl -fsSL https://opencode.ai/install | bash";

export function Settings() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [hotkeyError, setHotkeyError] = useState("");
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState("");
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

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
    if ("plate" in patch) api.setPlate(next.plate, next.plateEdge, next.plateOffset, next.plateMonitor).catch(() => {});
  };

  const chooseHotkey = async (accel: string) => {
    setHotkeyError("");
    setRecording(false);
    try {
      await api.setHotkey(accel);
      update({ hotkey: accel });
    } catch (e) {
      setHotkeyError(`${hotkeyLabel(accel)} is taken by another app or the system. Try another. (${errorText(e)})`);
      // put the previous shortcut back so unblurt is never left without one
      api.setHotkey(loadPrefs().hotkey).catch(() => {});
    }
  };

  const startRecording = () => {
    setHotkeyError("");
    setHeld("");
    setRecording(true);
    // otherwise pressing the current shortcut would open the popover instead of being recorded
    api.suspendHotkey().catch(() => {});
  };

  const stopRecording = () => {
    setRecording(false);
    setHeld("");
    api.setHotkey(loadPrefs().hotkey).catch(() => {});
  };

  // While recording, the next real key combo becomes the shortcut. Esc cancels.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) return stopRecording();
      const mods = [e.metaKey && "Command", e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean).join("+");
      const r = recordFromEvent(e);
      if (r === null) return setHeld(mods ? hotkeyLabel(mods) : "");
      if ("error" in r) {
        setHotkeyError(r.error);
        setHeld("");
        return;
      }
      chooseHotkey(r.accel);
    };
    const onUp = (e: KeyboardEvent) => {
      const mods = [e.metaKey && "Command", e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean).join("+");
      setHeld(mods ? hotkeyLabel(mods) : "");
    };
    const onBlur = () => stopRecording();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [recording]);

  const isPreset = HOTKEYS.some((h) => h.accel === prefs.hotkey);

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
            <button
              key={h.accel}
              className={!recording && prefs.hotkey === h.accel ? "on" : ""}
              onClick={() => chooseHotkey(h.accel)}
            >
              {h.label}
            </button>
          ))}
          <button
            className={`custom${recording ? " recording" : !isPreset ? " on" : ""}`}
            onClick={() => (recording ? stopRecording() : startRecording())}
            title={recording ? "Press esc to cancel" : "Record your own shortcut"}
          >
            {recording ? (held ? `${held} …` : "press keys…") : isPreset ? "custom…" : hotkeyLabel(prefs.hotkey)}
          </button>
        </div>
        {hotkeyError && <p className="warn small">{hotkeyError}</p>}
        <p className="muted small">
          {recording
            ? "Press the combo you want, with ⌘, ⌃ or ⌥ in it. Esc cancels."
            : "Select text anywhere, press it, hit enter. That's the whole trick."}
        </p>
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
          A slim tab on the edge of your screen. Drag selected text onto it to open unblurt, or hover it for
          Rephrase, Shorter and Clipboard. The original text stays where it is. Grab its dots to move it to any
          side or corner.
        </p>
        {(prefs.plateEdge !== "left" || prefs.plateOffset !== 0.5) && (
          <button
            className="ghost"
            onClick={() => {
              const next = savePrefs({ plateEdge: "left", plateOffset: 0.5, plateMonitor: null });
              setPrefs(next);
              api.setPlate(next.plate, "left", 0.5, null).catch(() => {});
            }}
          >
            move it back to the left
          </button>
        )}
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
        <div className="settings-credit">
          <span className="muted small">{version ? `unblurt v${version}` : "unblurt"}</span>
          <span className="muted small">
            <span aria-hidden="true">☕</span> All this technical bakajiki, built on koffooo by Viral Sachde.
          </span>
        </div>
        <button className="ghost" onClick={() => api.quit()}>
          quit unblurt
        </button>
      </footer>
    </main>
  );
}
