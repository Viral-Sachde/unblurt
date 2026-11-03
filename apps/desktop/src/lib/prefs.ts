import type { ModelRef } from "./api";
import type { ModeId, Tone } from "./modes";

export interface Prefs {
  mode: ModeId;
  tone: Tone;
  model: ModelRef | null;
  hotkey: string;
  /** The drop target on the left edge of the screen. */
  plate: boolean;
}

export const isMac = navigator.userAgent.includes("Mac");

export const HOTKEYS = [
  { accel: "CommandOrControl+Shift+Space", label: isMac ? "⌘ ⇧ Space" : "Ctrl Shift Space" },
  { accel: "Alt+Space", label: isMac ? "⌥ Space" : "Alt Space" },
  { accel: "CommandOrControl+Shift+U", label: isMac ? "⌘ ⇧ U" : "Ctrl Shift U" },
  { accel: "CommandOrControl+Alt+J", label: isMac ? "⌘ ⌥ J" : "Ctrl Alt J" },
];

const KEY = "unblurt.prefs";
const DEFAULTS: Prefs = { mode: "rephrase", tone: "neutral", model: null, hotkey: HOTKEYS[0].accel, plate: true };

// localStorage is shared by the popover and settings windows (same origin),
// and the `storage` event keeps them in sync.
export function loadPrefs(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(patch: Partial<Prefs>) {
  const next = { ...loadPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode or quota: prefs just won't persist */
  }
  return next;
}

export const hotkeyLabel = (accel: string) => HOTKEYS.find((h) => h.accel === accel)?.label ?? accel;
export const modKey = isMac ? "⌘" : "Ctrl";
