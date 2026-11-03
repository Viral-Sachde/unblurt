mod front;
mod keys;
mod opencode;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, RunEvent, State, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use opencode::{Engine, Models, Status, TransformRequest};

const DEFAULT_HOTKEY: &str = "CommandOrControl+Shift+Space";

#[derive(Clone, Serialize, Default)]
struct Summon {
    text: String,
    /// Switch the popover to this mode first (quick actions on the plate).
    mode: Option<String>,
    /// Start the rewrite straight away instead of waiting for Enter.
    run: bool,
}

/// Where the cursor is relative to the plate, in the plate window's own logical pixels.
#[derive(Clone, Serialize, PartialEq)]
struct PlatePointer {
    inside: bool,
    x: i32,
    y: i32,
}

/// Whether the plate is on screen; read by the pointer watcher without touching the main thread.
static PLATE_ON: AtomicBool = AtomicBool::new(false);

fn popover(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("popover")
}

fn plate(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("plate")
}

/// Hotkey pressed (or the plate clicked): grab the selection from the app the user is in,
/// then show the popover over it.
fn summon(app: &AppHandle) {
    let Some(win) = popover(app) else { return };
    if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
        return;
    }
    let app = app.clone();
    // Copying the selection sleeps a little while the target app responds; keep that off the main thread.
    std::thread::spawn(move || {
        let text = keys::grab_selection().unwrap_or_default();
        open_with(&app, Summon { text, ..Default::default() }, false);
    });
}

/// Shows the popover filled with `text`: top-center of the active screen, or beside the plate
/// when the text was dropped on it.
fn open_with(app: &AppHandle, summon: Summon, beside_plate: bool) {
    let Some(win) = popover(app) else { return };
    front::remember();
    let _ = app.emit_to("popover", "summon", summon);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if !(beside_plate && place_beside_plate(&handle, &win)) {
            place_on_active_screen(&handle, &win);
        }
        let _ = win.show();
        let _ = win.set_focus();
    });
}

/// The plate hugs the left edge of the main screen, vertically centred in the usable area.
fn place_plate(app: &AppHandle) {
    let Some(win) = plate(app) else { return };
    let monitor = app.primary_monitor().ok().flatten().or_else(|| win.current_monitor().ok().flatten());
    let (Some(m), Ok(size)) = (monitor, win.outer_size()) else { return };
    let area = m.work_area();
    let y = area.position.y + (area.size.height as i32 - size.height as i32) / 2;
    let _ = win.set_position(PhysicalPosition::new(area.position.x, y));
}

/// The plate's window never becomes key, so macOS doesn't send it hover events while another app
/// is active. Instead, watch the cursor and tell the plate where it is.
fn watch_plate_pointer(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<PlatePointer> = None;
        loop {
            std::thread::sleep(Duration::from_millis(40));
            if !PLATE_ON.load(Ordering::Relaxed) {
                last = None;
                continue;
            }
            // keep note of the app you're working in, before a click on the plate activates us
            front::track();
            let Some(win) = plate(&app) else { continue };
            let (Ok(c), Ok(pos), Ok(size), Ok(scale)) =
                (app.cursor_position(), win.outer_position(), win.outer_size(), win.scale_factor())
            else {
                continue;
            };
            let (dx, dy) = (c.x - pos.x as f64, c.y - pos.y as f64);
            let inside = dx >= 0.0 && dy >= 0.0 && dx < size.width as f64 && dy < size.height as f64;
            let now = if inside {
                PlatePointer { inside, x: (dx / scale) as i32, y: (dy / scale) as i32 }
            } else {
                PlatePointer { inside, x: 0, y: 0 }
            };
            if last.as_ref() != Some(&now) {
                let _ = app.emit_to("plate", "plate-pointer", now.clone());
                last = Some(now);
            }
        }
    });
}

/// Opens the popover just right of the plate, centred on it, kept on screen.
fn place_beside_plate(app: &AppHandle, win: &WebviewWindow) -> bool {
    let Some(p) = plate(app) else { return false };
    let (Ok(pp), Ok(ps), Ok(size), Some(m)) = (p.outer_position(), p.outer_size(), win.outer_size(), p.current_monitor().ok().flatten())
    else {
        return false;
    };
    let area = m.work_area();
    let scale = m.scale_factor();
    let x = area.position.x + (24.0 * scale) as i32;
    let centre = pp.y + ps.height as i32 / 2;
    let top = area.position.y;
    let bottom = area.position.y + area.size.height as i32 - size.height as i32;
    let y = (centre - size.height as i32 / 2).clamp(top, bottom.max(top));
    let _ = win.set_position(PhysicalPosition::new(x, y));
    true
}

/// Top-center of whichever screen the cursor is on, where the eye already is.
fn place_on_active_screen(app: &AppHandle, win: &WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| win.current_monitor().ok().flatten());
    let (Some(m), Ok(size)) = (monitor, win.outer_size()) else { return };
    let (pos, area) = (m.position(), m.size());
    let x = pos.x + (area.width as i32 - size.width as i32) / 2;
    let y = pos.y + (area.height as f64 * 0.2) as i32;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

/// Gives focus back to the app the user came from, so a paste lands there.
fn hide_and_return_focus(app: &AppHandle) {
    if let Some(win) = popover(app) {
        let _ = win.hide();
    }
    // Hiding a window on macOS doesn't reactivate the previous app, so bring it back ourselves.
    // (Never hide the whole app for this: it would take the plate down with it.)
    #[cfg(target_os = "macos")]
    if !app.get_webview_window("settings").and_then(|w| w.is_visible().ok()).unwrap_or(false) {
        front::restore(app);
    }
}

fn show_settings(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        if let Some(p) = popover(app) {
            let _ = p.hide();
        }
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[tauri::command]
async fn transform(engine: State<'_, Engine>, req: TransformRequest) -> Result<String, String> {
    engine.transform(req).await
}

#[tauri::command]
async fn list_models(engine: State<'_, Engine>) -> Result<Models, String> {
    engine.models().await
}

#[tauri::command]
async fn engine_status(engine: State<'_, Engine>) -> Result<Status, String> {
    Ok(engine.status().await)
}

#[tauri::command]
async fn restart_engine(engine: State<'_, Engine>) -> Result<Status, String> {
    Ok(engine.restart().await)
}

#[tauri::command]
fn paste_text(app: AppHandle, text: String) -> Result<(), String> {
    hide_and_return_focus(&app);
    std::thread::spawn(move || {
        // Give the OS a moment to hand focus back before pressing paste.
        std::thread::sleep(Duration::from_millis(180));
        let _ = keys::paste(&text);
    });
    Ok(())
}

#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    keys::copy(&text)
}

#[tauri::command]
fn hide_popover(app: AppHandle) {
    hide_and_return_focus(&app);
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    show_settings(&app);
}

#[tauri::command]
fn set_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    let shortcut: Shortcut = accelerator.parse().map_err(|e| format!("{e}"))?;
    let gs = app.global_shortcut();
    if gs.is_registered(shortcut) {
        return Ok(());
    }
    gs.unregister_all().map_err(|e| e.to_string())?;
    if let Err(e) = gs.register(shortcut) {
        // Don't leave the user without any way to summon the app.
        let _ = gs.register(DEFAULT_HOTKEY);
        return Err(e.to_string());
    }
    Ok(())
}

/// Text was dragged out of another app and dropped on the plate.
#[tauri::command]
fn plate_drop(app: AppHandle, text: String) {
    if !text.trim().is_empty() {
        open_with(&app, Summon { text, ..Default::default() }, true);
    }
}

/// A quick action from the plate's menu. Uses the selection in the app you're in (the plate never
/// takes focus, so it's still frontmost), or the clipboard. With a mode on a selection, the rewrite
/// starts right away.
#[tauri::command]
fn plate_action(app: AppHandle, mode: Option<String>, clipboard: bool) {
    std::thread::spawn(move || {
        let text = if clipboard {
            keys::clipboard_text()
        } else {
            // The click on the plate activated unblurt. Hand focus back to the app with the
            // selection first, or the simulated ⌘C would land in unblurt instead.
            front::restore(&app);
            std::thread::sleep(Duration::from_millis(320));
            keys::grab_selection().unwrap_or_default()
        };
        let run = !text.trim().is_empty() && mode.as_deref().is_some_and(|m| m != "ask");
        open_with(&app, Summon { text, mode, run }, true);
    });
}

/// Resizes the plate and re-pins it to the left edge, centred, so it grows and shrinks in place
/// whatever order the startup placement and the first resize arrive in.
#[tauri::command]
fn size_plate(app: AppHandle, width: f64, height: f64) {
    let Some(win) = plate(&app) else { return };
    let _ = win.set_size(LogicalSize::new(width, height));
    place_plate(&app);
}

#[tauri::command]
fn set_plate(app: AppHandle, visible: bool) {
    let Some(win) = plate(&app) else { return };
    PLATE_ON.store(visible, Ordering::Relaxed);
    if visible {
        place_plate(&app);
        let _ = win.show();
    } else {
        let _ = win.hide();
    }
}

/// Frees the global shortcut while Settings records a new one, so pressing the current
/// combo is captured instead of opening the popover. `set_hotkey` re-registers.
#[tauri::command]
fn suspend_hotkey(app: AppHandle) -> Result<(), String> {
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // On release, so the hotkey's keys aren't still down when we press copy.
                    if event.state() == ShortcutState::Released {
                        summon(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            transform,
            list_models,
            engine_status,
            restart_engine,
            paste_text,
            copy_text,
            hide_popover,
            open_settings,
            set_hotkey,
            suspend_hotkey,
            plate_drop,
            plate_action,
            size_plate,
            set_plate,
            quit
        ])
        .setup(|app| {
            // A menu-bar/tray utility: no Dock icon on macOS.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let data_dir = app.path().app_data_dir()?;
            app.manage(Engine::new(data_dir));

            // Warm the engine up in the background so the first rewrite isn't slow.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = handle.state::<Engine>().ensure().await;
            });

            app.global_shortcut().register(DEFAULT_HOTKEY)?;
            watch_plate_pointer(app.handle().clone());

            if let Some(win) = popover(app.handle()) {
                let w = win.clone();
                win.on_window_event(move |e| {
                    if let WindowEvent::Focused(false) = e {
                        let _ = w.hide();
                    }
                });
            }
            if let Some(win) = app.get_webview_window("settings") {
                let w = win.clone();
                win.on_window_event(move |e| {
                    if let WindowEvent::CloseRequested { api, .. } = e {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            let open = MenuItem::with_id(app, "open", "Open unblurt", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit unblurt", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &settings, &PredefinedMenuItem::separator(app)?, &quit])?;

            TrayIconBuilder::with_id("tray")
                .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .icon_as_template(true)
                .tooltip("unblurt")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => summon(app),
                    "settings" => show_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building unblurt");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            tauri::async_runtime::block_on(app.state::<Engine>().shutdown());
        }
    });
}

#[cfg(test)]
mod tests {
    use tauri_plugin_global_shortcut::Shortcut;

    /// Every accelerator shape the Settings recorder can produce must parse.
    #[test]
    fn recorder_accelerators_parse() {
        let mut keys: Vec<String> = ('A'..='Z').map(|c| format!("Key{c}")).collect();
        keys.extend((0..=9).map(|d| format!("Digit{d}")));
        keys.extend((1..=12).map(|n| format!("F{n}")));
        keys.extend((0..=9).map(|d| format!("Numpad{d}")));
        for k in [
            "NumpadAdd", "NumpadDecimal", "NumpadDivide", "NumpadEnter", "NumpadEqual", "NumpadMultiply",
            "NumpadSubtract", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "Tab",
            "Backspace", "Delete", "Home", "End", "PageUp", "PageDown", "Insert", "Minus", "Equal",
            "BracketLeft", "BracketRight", "Backslash", "Semicolon", "Quote", "Backquote", "Comma",
            "Period", "Slash",
        ] {
            keys.push(k.to_string());
        }
        let mod_sets = ["Command", "Control", "Alt", "Super", "Command+Shift", "Control+Alt", "Command+Control+Alt+Shift"];
        for k in &keys {
            for m in mod_sets {
                let accel = format!("{m}+{k}");
                assert!(accel.parse::<Shortcut>().is_ok(), "failed to parse {accel}");
            }
        }
        for n in 1..=12 {
            assert!(format!("F{n}").parse::<Shortcut>().is_ok());
        }
        for preset in ["CommandOrControl+Shift+Space", "Alt+Space", "CommandOrControl+Shift+U", "CommandOrControl+Alt+J"] {
            assert!(preset.parse::<Shortcut>().is_ok());
        }
    }
}
