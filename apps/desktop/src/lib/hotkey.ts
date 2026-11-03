// Recording a custom global shortcut from a keydown event, and showing any accelerator nicely.
// Accelerators use the names tauri-plugin-global-shortcut parses: "Command+Shift+KeyU", "Alt+Space"...

import { isMac } from "./prefs";

// Physical keys (KeyboardEvent.code) the global shortcut parser understands.
const KEY_CODE =
  /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Numpad([0-9]|Add|Decimal|Divide|Enter|Equal|Multiply|Subtract)|Arrow(Up|Down|Left|Right)|Space|Enter|Tab|Backspace|Delete|Home|End|PageUp|PageDown|Insert|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash)$/;

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift", "OS", "Hyper", "Super", "Fn", "CapsLock"]);

// Single-modifier combos every app relies on; grabbing them globally would break copy, paste, quit...
const RESERVED = new Set(["KeyA", "KeyC", "KeyV", "KeyX", "KeyZ", "KeyQ", "KeyW", "KeyS", "KeyF", "KeyN", "KeyT", "KeyP", "KeyH", "KeyM", "Tab", "Space"]);

export type Recorded = { accel: string } | { error: string } | null;

/** null = only modifiers held so far, keep listening. */
export function recordFromEvent(e: Pick<KeyboardEvent, "code" | "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): Recorded {
  if (MODIFIER_KEYS.has(e.key)) return null;
  if (!KEY_CODE.test(e.code)) return { error: "That key can't be used in a shortcut. Try a letter, number or F-key." };

  const mods: string[] = [];
  if (e.metaKey) mods.push(isMac ? "Command" : "Super");
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  const fKey = /^F([1-9]|1[0-2])$/.test(e.code);
  const strong = e.metaKey || e.ctrlKey || e.altKey;
  if (!strong && !fKey) {
    return { error: `Add ${isMac ? "⌘, ⌃ or ⌥" : "Ctrl or Alt"} so normal typing doesn't trigger it.` };
  }
  const primary = isMac ? e.metaKey : e.ctrlKey;
  const onlyPrimary = primary && mods.length === 1;
  if (onlyPrimary && RESERVED.has(e.code)) {
    return { error: `${label(`${mods[0]}+${e.code}`)} belongs to every app. Add ⇧ or ${isMac ? "⌥" : "Alt"} to it.` };
  }
  return { accel: [...mods, e.code].join("+") };
}

const KEY_LABEL: Record<string, string> = {
  Space: "Space", Enter: "↵", Tab: "Tab", Backspace: "⌫", Delete: "Del", Home: "Home", End: "End",
  PageUp: "PgUp", PageDown: "PgDn", Insert: "Ins", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
  Backslash: "\\", Semicolon: ";", Quote: "'", Backquote: "`", Comma: ",", Period: ".", Slash: "/",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
};

/** "Command+Shift+KeyU" -> "⌘ ⇧ U" on macOS, "Ctrl Shift U" elsewhere. */
export function label(accel: string): string {
  return accel
    .split("+")
    .map((p) => {
      switch (p.toLowerCase()) {
        case "commandorcontrol": case "cmdorctrl": case "commandorctrl": case "cmdorcontrol":
          return isMac ? "⌘" : "Ctrl";
        case "command": case "cmd": case "super": return isMac ? "⌘" : "Win";
        case "control": case "ctrl": return isMac ? "⌃" : "Ctrl";
        case "alt": case "option": return isMac ? "⌥" : "Alt";
        case "shift": return isMac ? "⇧" : "Shift";
      }
      if (KEY_LABEL[p]) return KEY_LABEL[p];
      if (/^Key[A-Z]$/.test(p)) return p.slice(3);
      if (/^Digit[0-9]$/.test(p)) return p.slice(5);
      if (p.startsWith("Numpad")) return `Num ${p.slice(6)}`;
      return p;
    })
    .join(" ");
}
