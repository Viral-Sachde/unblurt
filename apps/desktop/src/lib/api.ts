import { invoke } from "@tauri-apps/api/core";
import type { PlateEdge } from "./prefs";

export interface ModelRef {
  providerID: string;
  modelID: string;
}

export interface ModelOption extends ModelRef {
  providerName: string;
  modelName: string;
}

export interface EngineStatus {
  running: boolean;
  url: string | null;
  binary: string | null;
  error: string | null;
}

export const api = {
  transform: (req: { system: string; prompt: string; model: ModelRef | null }) =>
    invoke<string>("transform", { req }),
  paste: (text: string) => invoke<void>("paste_text", { text }),
  copy: (text: string) => invoke<void>("copy_text", { text }),
  hide: () => invoke<void>("hide_popover"),
  openSettings: () => invoke<void>("open_settings"),
  models: () => invoke<{ models: ModelOption[]; defaults: Record<string, string> }>("list_models"),
  status: () => invoke<EngineStatus>("engine_status"),
  restartEngine: () => invoke<EngineStatus>("restart_engine"),
  setHotkey: (accelerator: string) => invoke<void>("set_hotkey", { accelerator }),
  /** Lets go of the global shortcut while a new one is being recorded. */
  suspendHotkey: () => invoke<void>("suspend_hotkey"),
  plateDrop: (text: string) => invoke<void>("plate_drop", { text }),
  plateAction: (mode: string | null, clipboard: boolean) => invoke<void>("plate_action", { mode, clipboard }),
  sizePlate: (width: number, height: number) => invoke<void>("size_plate", { width, height }),
  /** Shows or hides the plate; edge/offset/monitor (from prefs) say where it goes. */
  setPlate: (visible: boolean, edge?: PlateEdge, offset?: number, monitor?: string | null) =>
    invoke<void>("set_plate", { visible, edge, offset, monitor }),
  /** Starts moving the plate with the cursor; Rust snaps it to an edge on release ("plate-moved"). */
  plateDrag: () => invoke<void>("plate_drag"),
  quit: () => invoke<void>("quit"),
};

export const errorText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e));
