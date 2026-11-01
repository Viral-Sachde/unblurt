import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@fontsource-variable/inter";
import "./styles.css";
import { Popover } from "./popover/Popover";
import { Settings } from "./settings/Settings";

// One bundle, two windows: the label set in tauri.conf.json decides which UI mounts.
const label = getCurrentWindow().label;
document.documentElement.dataset.window = label;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{label === "settings" ? <Settings /> : <Popover />}</React.StrictMode>,
);
