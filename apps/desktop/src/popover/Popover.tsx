import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { Mark } from "../components/Mark";
import { api, errorText } from "../lib/api";
import { MODES, TONES, buildPrompt, cleanOutput, modeById, type ModeId, type Tone } from "../lib/modes";
import { loadPrefs, modKey, savePrefs } from "../lib/prefs";

type Phase = "compose" | "working" | "done" | "error";

const WINDOW_WIDTH = 640;
const SHADOW_GUTTER = 20; // transparent space around the card so its shadow isn't clipped
const WORKING_LINES = ["untangling…", "finding the point…", "sanding the edges…", "making it sound like you…"];

export function Popover() {
  const [mode, setMode] = useState<ModeId>(() => loadPrefs().mode);
  const [tone, setTone] = useState<Tone>(() => loadPrefs().tone);
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");
  const [output, setOutput] = useState("");
  const [phase, setPhase] = useState<Phase>("compose");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [workingLine, setWorkingLine] = useState(0);
  const [nudge, setNudge] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const runId = useRef(0);
  const autoRun = useRef(false); // set by a plate quick action; run once the new input/mode land

  const current = modeById(mode);

  // The window lives for the whole session, so replay the card's entrance on every summon,
  // and let it fade out before the window hides.
  const closing = useRef(false);
  const replayIn = () => {
    const card = cardRef.current;
    if (!card) return;
    closing.current = false;
    card.classList.remove("out");
    card.style.animation = "none";
    void card.offsetWidth; // restart the animation
    card.style.animation = "";
  };
  const close = () => {
    const card = cardRef.current;
    if (!card || closing.current) return;
    closing.current = true;
    card.classList.add("out");
    window.setTimeout(() => {
      if (!closing.current) return;
      api.hide();
      card.classList.remove("out");
      closing.current = false;
    }, 70);
  };

  // Apply the saved global shortcut once at launch; this window lives for the whole session.
  useEffect(() => {
    api.setHotkey(loadPrefs().hotkey).catch(() => {});
  }, []);

  // Summoned by the global shortcut, with whatever text was selected in the frontmost app.
  useEffect(() => {
    const un = listen<{ text: string; mode?: string | null; run?: boolean }>("summon", ({ payload }) => {
      runId.current++;
      replayIn();
      const m = MODES.find((x) => x.id === payload.mode);
      if (m) {
        setMode(m.id);
        savePrefs({ mode: m.id });
      }
      autoRun.current = !!payload.run && payload.text.trim().length > 0;
      setInput(payload.text);
      setNote("");
      setOutput("");
      setError("");
      setPhase("compose");
      // With a selection the next thing you usually type is the note; without one, the text itself.
      requestAnimationFrame(() => {
        if (payload.text) noteRef.current?.focus();
        else inputRef.current?.focus();
      });
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // Size the native window to the card so there are no invisible click-blocking margins.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const win = getCurrentWindow();
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(card.getBoundingClientRect().height) + SHADOW_GUTTER * 2;
      win.setSize(new LogicalSize(WINDOW_WIDTH, h)).catch(() => {});
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (phase !== "working") return;
    setWorkingLine(0);
    const t = setInterval(() => setWorkingLine((i) => (i + 1) % WORKING_LINES.length), 1600);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "done") requestAnimationFrame(() => outputRef.current?.focus());
  }, [phase]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1400);
  };

  const pickMode = useCallback((id: ModeId) => {
    setMode(id);
    savePrefs({ mode: id });
  }, []);

  const cycleTone = useCallback(() => {
    setTone((t) => {
      const next = TONES[(TONES.findIndex((x) => x.id === t) + 1) % TONES.length].id;
      savePrefs({ tone: next });
      return next;
    });
  }, []);

  const run = useCallback(async () => {
    const hasInput = input.trim().length > 0;
    if (!hasInput && !(mode === "ask" && note.trim())) {
      setNudge(true);
      setTimeout(() => setNudge(false), 400);
      inputRef.current?.focus();
      return;
    }
    const id = ++runId.current;
    setPhase("working");
    setError("");
    try {
      const { system, prompt } = buildPrompt({ mode, tone, input, note });
      const out = await api.transform({ system, prompt, model: loadPrefs().model });
      if (id !== runId.current) return;
      setOutput(cleanOutput(out));
      setPhase("done");
    } catch (e) {
      if (id !== runId.current) return;
      setError(errorText(e));
      setPhase("error");
    }
  }, [input, note, mode, tone]);

  // A quick action from the plate asked for the rewrite to start straight away.
  useEffect(() => {
    if (autoRun.current && input.trim()) {
      autoRun.current = false;
      run();
    }
  }, [run, input]);

  const paste = useCallback(() => {
    if (output.trim()) api.paste(output).catch((e) => (setError(errorText(e)), setPhase("error")));
  }, [output]);

  const copy = useCallback(async () => {
    await api.copy(output);
    flash("copied");
  }, [output]);

  const backToEdit = () => {
    runId.current++;
    setPhase("compose");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase === "working") backToEdit();
        else close();
        return;
      }
      if (mod && /^[1-7]$/.test(e.key)) {
        e.preventDefault();
        pickMode(MODES[Number(e.key) - 1].id);
        if (phase !== "compose") backToEdit();
        return;
      }
      if (mod && e.key.toLowerCase() === "t") return e.preventDefault(), cycleTone();
      if (mod && e.key === ",") return e.preventDefault(), void api.openSettings();
      if (mod && e.key.toLowerCase() === "r" && (phase === "done" || phase === "error")) return e.preventDefault(), void run();
      if (mod && e.key.toLowerCase() === "e" && phase !== "compose") return e.preventDefault(), backToEdit();
      if (mod && e.key.toLowerCase() === "c" && phase === "done") {
        const ta = outputRef.current;
        const hasSelection = ta && document.activeElement === ta && ta.selectionStart !== ta.selectionEnd;
        if (!hasSelection) return e.preventDefault(), void copy();
      }
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        if (phase === "compose") return e.preventDefault(), void run();
        if (phase === "done") return e.preventDefault(), paste();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, run, paste, copy, pickMode, cycleTone]);

  return (
    <div className="popover-stage">
      <div ref={cardRef} className={`card phase-${phase}${nudge ? " nudge" : ""}`}>
        <header className="bar" data-tauri-drag-region>
          <div className="brand" data-tauri-drag-region>
            <Mark size={20} />
            <span>unblurt</span>
          </div>
          <div className="bar-right">
            <button className="tone" onClick={cycleTone} title={`Tone · ${modKey}T`}>
              <span className="tone-dot" />
              {tone}
            </button>
            <button className="icon-btn" onClick={() => api.openSettings()} title={`Settings · ${modKey},`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </button>
            <button className="icon-btn" onClick={close} title="Close · esc" aria-label="Close">
              <svg width="13" height="13" viewBox="0 0 12 12">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <nav className="modes" role="tablist">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={m.id === mode}
              className={`chip${m.id === mode ? " on" : ""}`}
              onClick={() => {
                pickMode(m.id);
                if (phase !== "compose") backToEdit();
              }}
              title={`${modKey}${i + 1}`}
            >
              {m.label}
            </button>
          ))}
        </nav>

        {phase === "compose" || phase === "working" ? (
          <section className="compose">
            <textarea
              ref={inputRef}
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={current.placeholder}
              rows={Math.min(8, Math.max(3, input.split("\n").length))}
              disabled={phase === "working"}
              spellCheck={false}
              autoFocus
            />
            <label className="note">
              <span className="note-plus">+</span>
              <input
                ref={noteRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={current.notePlaceholder}
                disabled={phase === "working"}
              />
            </label>
            {phase === "working" && (
              <div className="working" aria-live="polite">
                <span className="pulse" />
                {WORKING_LINES[workingLine]}
              </div>
            )}
          </section>
        ) : phase === "done" ? (
          <section className="result">
            <div className="result-label">
              <span>sorted.</span>
              <span className="result-meta">
                {current.label.toLowerCase()}
                {current.usesTone ? ` · ${tone}` : ""}
              </span>
            </div>
            <textarea
              ref={outputRef}
              className="output"
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              rows={Math.min(12, Math.max(3, output.split("\n").length + 1))}
            />
          </section>
        ) : (
          <section className="error">
            <strong>couldn't get that sorted.</strong>
            <p>{error}</p>
          </section>
        )}

        <footer className="foot">
          <div className="hints">
            {phase === "compose" && (
              <>
                <span><kbd>{modKey}</kbd><kbd>1–7</kbd> mode</span>
                <span><kbd>{modKey}</kbd><kbd>T</kbd> tone</span>
                <span><kbd>esc</kbd> close</span>
              </>
            )}
            {phase === "working" && <span><kbd>esc</kbd> stop</span>}
            {phase === "done" && (
              <>
                <span><kbd>{modKey}</kbd><kbd>R</kbd> again</span>
                <span><kbd>{modKey}</kbd><kbd>E</kbd> edit</span>
              </>
            )}
            {phase === "error" && (
              <>
                <span><kbd>{modKey}</kbd><kbd>E</kbd> edit</span>
                <span><kbd>{modKey}</kbd><kbd>,</kbd> settings</span>
              </>
            )}
          </div>
          <div className="actions">
            {toast && <span className="toast">{toast}</span>}
            {phase === "compose" && (
              <button className="primary" onClick={run}>
                unblurt <kbd>↵</kbd>
              </button>
            )}
            {phase === "working" && (
              <button className="primary" disabled>
                working…
              </button>
            )}
            {phase === "done" && (
              <>
                <button className="ghost" onClick={copy}>
                  copy <kbd>{modKey}C</kbd>
                </button>
                <button className="primary" onClick={paste}>
                  paste <kbd>↵</kbd>
                </button>
              </>
            )}
            {phase === "error" && (
              <button className="primary" onClick={run}>
                try again <kbd>{modKey}R</kbd>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
