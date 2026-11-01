import { invoke } from "@tauri-apps/api/core";

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
  quit: () => invoke<void>("quit"),
};

export const errorText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e));
