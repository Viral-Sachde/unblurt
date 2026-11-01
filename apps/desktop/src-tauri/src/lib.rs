mod keys;
mod opencode;

use std::time::Duration;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, RunEvent, State, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use opencode::{Engine, Models, Status, TransformRequest};

const DEFAULT_HOTKEY: &str = "CommandOrControl+Shift+Space";

#[derive(Clone, Serialize)]
struct Summon {
    text: String,
}

fn popover(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("popover")
}

/// Hotkey pressed: grab the selection from the app the user is in, then show the popover over it.
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
        let _ = app.emit_to("popover", "summon", Summon { text });
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            place_on_active_screen(&handle, &win);
            let _ = win.show();
            let _ = win.set_focus();
        });
    });
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
    // Hiding a window on macOS doesn't reactivate the previous app; hiding the app does.
    #[cfg(target_os = "macos")]
    if !app.get_webview_window("settings").and_then(|w| w.is_visible().ok()).unwrap_or(false) {
        let _ = app.hide();
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
