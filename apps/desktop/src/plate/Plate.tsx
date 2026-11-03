import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { Mark } from "../components/Mark";
import { api } from "../lib/api";
import { loadPrefs } from "../lib/prefs";

// The plate: a slim tab on the left edge of the screen. Drop dragged text on it, or click it,
// to open unblurt. Its window never takes focus, so the app you came from stays frontmost
// and "paste" lands back in it.

type State = "idle" | "hover" | "drag" | "got";

// Window widths per state (logical px). Height stays fixed so the plate never jumps vertically.
const WIDTH: Record<State, number> = { idle: 16, hover: 60, drag: 248, got: 248 };
const HEIGHT = 176;

const hasText = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("text/plain");

export function Plate() {
  const [state, setState] = useState<State>("idle");
  const depth = useRef(0); // dragenter/dragleave fire for children too; count them
  const gotTimer = useRef<number>();

  // Show or hide the plate from the saved preference, and follow changes made in settings.
  useEffect(() => {
    const apply = () => api.setPlate(loadPrefs().plate).catch(() => {});
    apply();
    const onStorage = (e: StorageEvent) => e.key?.startsWith("unblurt.") && apply();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    getCurrentWindow().setSize(new LogicalSize(WIDTH[state], HEIGHT)).catch(() => {});
  }, [state]);

  const settle = () => setState("idle");

  return (
    <div
      className={`plate-stage s-${state}`}
      onMouseEnter={() => setState((s) => (s === "idle" ? "hover" : s))}
      onMouseLeave={() => setState((s) => (s === "hover" ? "idle" : s))}
      onClick={() => {
        setState("idle");
        api.plateClick().catch(() => {});
      }}
      onDragEnter={(e) => {
        if (!hasText(e)) return;
        e.preventDefault();
        depth.current++;
        window.clearTimeout(gotTimer.current);
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
        if (!text.trim()) return settle();
        setState("got");
        api.plateDrop(text).catch(() => {});
        gotTimer.current = window.setTimeout(settle, 700);
      }}
    >
      <div className="plate" role="button" aria-label="unblurt plate: drop text here, or click to unblurt your selection">
        <span className="plate-mark">
          <Mark size={22} />
        </span>
        <span className="plate-copy">
          <b>{state === "got" ? "got it." : "drop to unblurt"}</b>
          <small>{state === "got" ? "opening…" : "your original stays put"}</small>
        </span>
      </div>
    </div>
  );
}
