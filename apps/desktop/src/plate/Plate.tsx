import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Mark } from "../components/Mark";
import { api } from "../lib/api";
import { type ModeId } from "../lib/modes";
import { loadPrefs } from "../lib/prefs";

// The plate: a slim tab on the left edge of the screen.
//  - hover: a small rail of quick actions (Rephrase, Shorter on your selection; or the clipboard).
//    It hides again as soon as the cursor leaves, so there is no close button.
//  - drag text onto it: a landing pad; drop to open unblurt with that text
// Its window never takes focus, so the app you came from stays frontmost: the selection can be
// grabbed and "paste" lands back in it. Because of that, macOS won't send it hover events, so Rust
// watches the cursor and reports it here ("plate-pointer").

type State = "idle" | "menu" | "drag" | "got";

// Window size per state, in logical px. Rust resizes around the vertical centre.
// The menu window is wider than the rail so each button's label fits beside it.
const SIZE: Record<State, [number, number]> = { idle: [16, 176], menu: [176, 176], drag: [248, 176], got: [248, 176] };
const LEAVE_GRACE_MS = 320;

type Action = { kind: "mode"; mode: ModeId } | { kind: "clipboard" };

const ICONS = {
  rephrase: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7.5h10.5M12 4.5l3 3-3 3" />
      <path d="M16 12.5H5.5M8 9.5l-3 3 3 3" />
    </svg>
  ),
  shorter: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h12M4 10h8M4 14h5" />
    </svg>
  ),
  clipboard: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="4" width="11" height="13" rx="2.5" />
      <path d="M7.5 4V3.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4" />
      <path d="M7.5 9h5M7.5 12h3.5" />
    </svg>
  ),
};

const hasText = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("text/plain");

export function Plate() {
  const [state, setState] = useState<State>("idle");
  const [hot, setHot] = useState<string | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const depth = useRef(0); // dragenter/dragleave fire for children too; count them
  const timers = useRef<{ got?: number; leave?: number }>({});
  const stateRef = useRef(state);
  stateRef.current = state;

  // Show or hide the plate from the saved preference, and follow changes made in settings.
  useEffect(() => {
    const apply = () => api.setPlate(loadPrefs().plate).catch(() => {});
    apply();
    const onStorage = (e: StorageEvent) => e.key?.startsWith("unblurt.") && apply();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const [w, h] = SIZE[state];
    api.sizePlate(w, h).catch(() => {});
    if (state !== "menu") setHot(null);
  }, [state]);

  // Pointer reports from Rust: open the menu on arrival, highlight the row under the cursor,
  // close shortly after the cursor leaves.
  useEffect(() => {
    const un = listen<{ inside: boolean; x: number; y: number }>("plate-pointer", ({ payload }) => {
      const t = timers.current;
      if (payload.inside) {
        window.clearTimeout(t.leave);
        if (stateRef.current === "idle") setState("menu");
        const row = document.elementFromPoint(payload.x, payload.y)?.closest<HTMLElement>("[data-row]");
        setHot(row?.dataset.row ?? null);
      } else {
        setHot(null);
        if (stateRef.current === "menu") {
          window.clearTimeout(t.leave);
          t.leave = window.setTimeout(() => setState((s) => (s === "menu" ? "idle" : s)), LEAVE_GRACE_MS);
        }
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  const act = (id: string, a: Action) => {
    setPressed(id);
    window.setTimeout(() => {
      setPressed(null);
      setState("idle");
      if (a.kind === "clipboard") {
        api.plateAction(null, true).catch(() => {});
      } else {
        api.plateAction(a.mode, false).catch(() => {});
      }
    }, 120);
  };

  const rail = (id: string, a: Action, name: string, icon: React.ReactNode, primary = false) => (
    <button
      key={id}
      data-row={id}
      aria-label={name}
      className={`pr-btn${primary ? " primary" : ""}${hot === id ? " hot" : ""}${pressed === id ? " pressed" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        act(id, a);
      }}
    >
      {icon}
      <span className="pr-tip">{name}</span>
    </button>
  );

  return (
    <div
      className={`plate-stage s-${state}`}
      onDragEnter={(e) => {
        if (!hasText(e)) return;
        e.preventDefault();
        depth.current++;
        window.clearTimeout(timers.current.got);
        window.clearTimeout(timers.current.leave);
        setState("drag");
      }}
      onDragOver={(e) => {
        if (!hasText(e)) return;
        e.preventDefault();
        // copy, never move: the original text stays where it was
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setState((s) => (s === "drag" ? "idle" : s));
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        const text = e.dataTransfer.getData("text/plain");
        if (!text.trim()) return setState("idle");
        setState("got");
        api.plateDrop(text).catch(() => {});
        timers.current.got = window.setTimeout(() => setState("idle"), 700);
      }}
    >
      {state === "menu" ? (
        <div className="plate-rail" role="menu" aria-label="unblurt quick actions">
          {rail("rephrase", { kind: "mode", mode: "rephrase" }, "Rephrase", ICONS.rephrase, true)}
          {rail("shorten", { kind: "mode", mode: "shorten" }, "Shorter", ICONS.shorter)}
          <span className="pr-sep" />
          {rail("clipboard", { kind: "clipboard" }, "From clipboard", ICONS.clipboard)}
        </div>
      ) : (
        <div className="plate" aria-label="unblurt plate: drop text here">
          <span className="plate-mark">
            <Mark size={22} />
          </span>
          <span className="plate-copy">
            <b>{state === "got" ? "got it." : "drop to unblurt"}</b>
            <small>{state === "got" ? "opening…" : "your original stays put"}</small>
          </span>
        </div>
      )}
    </div>
  );
}
