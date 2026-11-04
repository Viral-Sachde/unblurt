import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Mark } from "../components/Mark";
import { api } from "../lib/api";
import { type ModeId } from "../lib/modes";
import { loadPrefs, savePrefs, type PlateEdge } from "../lib/prefs";

// The plate: a slim tab on an edge of the screen (left by default; drag it by the grip to any
// side or corner).
//  - hover: a small rail of quick actions (Rephrase, Shorter on your selection; or the clipboard).
//    It hides again as soon as the cursor leaves, so there is no close button.
//  - drag text onto it: a landing pad; drop to open unblurt with that text
// Its window never takes focus, so the app you came from stays frontmost: the selection can be
// grabbed and "paste" lands back in it. Because of that, macOS won't send it hover events, so Rust
// watches the cursor and reports it here ("plate-pointer").

// "leaving": the rail is fading out.
type State = "idle" | "menu" | "leaving" | "drag" | "got";

// The window is one fixed size (Rust's PLATE_WIN) and never resizes: everything in it animates
// with transforms, which the GPU does without re-laying-out the page. The empty parts of the
// window let clicks through; we tell Rust which part is visible ("hit") after every change.
const WIN: [number, number] = [248, 176];
const TAB = 16; // how far the resting tab's hover zone reaches in from the edge
const RAIL_PAD = 6; // a little slack around the rail so its edge doesn't flicker
const orient = (e: PlateEdge) => (e === "left" || e === "right" ? "side" : "flat");

type Moved = { edge: PlateEdge; offset: number; monitor: string | null };
const LEAVE_GRACE_MS = 60;
const EXIT_MS = 90; // rail fade-out (matches pr-out in styles.css)

// The resting tab's hover zone: a thin strip along the edge.
function tabHit(edge: PlateEdge): [number, number, number, number] {
  const [W, H] = WIN;
  const flatW = 176;
  switch (edge) {
    case "left": return [0, 0, TAB, H];
    case "right": return [W - TAB, 0, TAB, H];
    case "top": return [(W - flatW) / 2, 0, flatW, TAB];
    case "bottom": return [(W - flatW) / 2, H - TAB, flatW, TAB];
  }
}

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
  const [edge, setEdge] = useState<PlateEdge>(() => loadPrefs().plateEdge);
  const [hot, setHot] = useState<string | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const depth = useRef(0); // dragenter/dragleave fire for children too; count them
  const timers = useRef<{ got?: number; leave?: number; exit?: number }>({});
  const stateRef = useRef<State>("idle");
  const railRef = useRef<HTMLDivElement>(null);

  const go = useCallback((next: State) => {
    const cur = stateRef.current;
    if (cur === next) return;
    const t = timers.current;
    window.clearTimeout(t.exit);
    if (next === "idle" && cur === "menu") {
      // fade the rail out, then rest
      stateRef.current = "leaving";
      setState("leaving");
      t.exit = window.setTimeout(() => stateRef.current === "leaving" && go("idle"), EXIT_MS);
      return;
    }
    stateRef.current = next;
    setState(next);
  }, []);

  // Tell Rust which part of the window is there to be hovered and clicked.
  useLayoutEffect(() => {
    let hit = tabHit(edge);
    if ((state === "menu" || state === "leaving") && railRef.current) {
      const r = railRef.current; // offset* ignore the entrance transform, so this is the settled box
      hit = [r.offsetLeft - RAIL_PAD, r.offsetTop - RAIL_PAD, r.offsetWidth + RAIL_PAD * 2, r.offsetHeight + RAIL_PAD * 2];
    } else if (state === "drag" || state === "got") {
      hit = [0, 0, WIN[0], WIN[1]];
    }
    api.plateHit(...hit).catch(() => {});
  }, [state, edge]);

  // Show or hide the plate, at its saved spot, and follow changes made in settings.
  useEffect(() => {
    const apply = () => {
      const p = loadPrefs();
      setEdge(p.plateEdge);
      api.setPlate(p.plate, p.plateEdge, p.plateOffset, p.plateMonitor).catch(() => {});
    };
    apply();
    const onStorage = (e: StorageEvent) => e.key?.startsWith("unblurt.") && apply();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (state !== "menu") setHot(null);
  }, [state]);

  // Dropped somewhere new: remember the spot and turn to fit that edge.
  useEffect(() => {
    const un = listen<Moved>("plate-moved", ({ payload }) => {
      savePrefs({ plateEdge: payload.edge, plateOffset: payload.offset, plateMonitor: payload.monitor });
      window.clearTimeout(timers.current.exit);
      stateRef.current = "idle";
      setEdge(payload.edge);
      setState("idle");
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // Pointer reports from Rust: open the menu on arrival, highlight the row under the cursor,
  // close shortly after the cursor leaves.
  useEffect(() => {
    const un = listen<{ inside: boolean; x: number; y: number }>("plate-pointer", ({ payload }) => {
      const t = timers.current;
      if (payload.inside) {
        window.clearTimeout(t.leave);
        if (stateRef.current === "idle" || stateRef.current === "leaving") go("menu");
        const row = document.elementFromPoint(payload.x, payload.y)?.closest<HTMLElement>("[data-row]");
        setHot(row?.dataset.row ?? null);
      } else {
        setHot(null);
        if (stateRef.current === "menu") {
          window.clearTimeout(t.leave);
          t.leave = window.setTimeout(() => stateRef.current === "menu" && go("idle"), LEAVE_GRACE_MS);
        }
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, [go]);

  const act = (id: string, a: Action) => {
    setPressed(id);
    window.setTimeout(() => {
      setPressed(null);
      go("idle");
      if (a.kind === "clipboard") {
        api.plateAction(null, true).catch(() => {});
      } else {
        api.plateAction(a.mode, false).catch(() => {});
      }
    }, 120);
  };

  const rail = (i: number, id: string, a: Action, name: string, icon: React.ReactNode, primary = false) => (
    <button
      key={id}
      data-row={id}
      style={{ "--i": i } as React.CSSProperties}
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
      className={`plate-stage s-${state} edge-${edge} ${orient(edge)}`}
      onDragEnter={(e) => {
        if (!hasText(e)) return;
        e.preventDefault();
        depth.current++;
        window.clearTimeout(timers.current.got);
        window.clearTimeout(timers.current.leave);
        go("drag");
      }}
      onDragOver={(e) => {
        if (!hasText(e)) return;
        e.preventDefault();
        // copy, never move: the original text stays where it was
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0 && stateRef.current === "drag") go("idle");
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        const text = e.dataTransfer.getData("text/plain");
        if (!text.trim()) return go("idle");
        go("got");
        api.plateDrop(text).catch(() => {});
        timers.current.got = window.setTimeout(() => go("idle"), 700);
      }}
    >
      {state === "menu" || state === "leaving" ? (
        <div ref={railRef} className="plate-rail" role="menu" aria-label="unblurt quick actions">
          <span
            className={`pr-grip${hot === "grip" ? " hot" : ""}`}
            data-row="grip"
            style={{ "--i": 0 } as React.CSSProperties}
            role="button"
            aria-label="Drag to move the plate"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              api.plateDrag().catch(() => {});
            }}
          >
            <svg viewBox="0 0 12 8" aria-hidden="true">
              <circle cx="2" cy="2" r="1.1" /><circle cx="6" cy="2" r="1.1" /><circle cx="10" cy="2" r="1.1" />
              <circle cx="2" cy="6" r="1.1" /><circle cx="6" cy="6" r="1.1" /><circle cx="10" cy="6" r="1.1" />
            </svg>
            <span className="pr-tip">Drag to move</span>
          </span>
          {rail(1, "rephrase", { kind: "mode", mode: "rephrase" }, "Rephrase", ICONS.rephrase, true)}
          {rail(2, "shorten", { kind: "mode", mode: "shorten" }, "Shorter", ICONS.shorter)}
          <span className="pr-sep" />
          {rail(3, "clipboard", { kind: "clipboard" }, "From clipboard", ICONS.clipboard)}
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
