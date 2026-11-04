mod front;
mod keys;
mod plate_pos;
mod opencode;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, RunEvent, State, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use opencode::{Engine, Models, Status, TransformRequest};
use plate_pos::{Area, Edge, PlatePos};

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
/// Which edge of which screen the plate lives on (saved in prefs by the plate window).
static PLATE_POS: Mutex<PlatePos> = Mutex::new(PlatePos::DEFAULT);
/// True while the user is dragging the plate to a new spot.
static PLATE_DRAGGING: AtomicBool = AtomicBool::new(false);
/// The plate window's size as last requested (logical px). Used instead of asking the window,
/// which keeps reporting the old size for a moment after a resize.
static PLATE_SIZE: Mutex<(f64, f64)> = Mutex::new((16.0, 176.0));
/// The plate window's fixed size (logical px). It never resizes while in use: resizing a
/// webview window re-lays-out and repaints the page mid-animation, which is what made it janky.
/// Everything inside animates with transforms instead, and the empty parts let clicks through.
const PLATE_WIN: (f64, f64) = (248.0, 176.0);
/// The part of the plate window that's actually there right now (logical px, window-relative):
/// the tab, the rail or the landing pad. Reported by the plate window. Outside it the window
/// ignores the mouse, so the transparent rest of it never blocks the app underneath.
static PLATE_HIT: Mutex<(f64, f64, f64, f64)> = Mutex::new((0.0, 0.0, 16.0, 176.0));

/// `UNBLURT_DEBUG=1` prints what the plate is doing (moves, snaps) to stderr.
macro_rules! debug_log {
    ($($arg:tt)*) => {
        if std::env::var_os("UNBLURT_DEBUG").is_some() {
            eprintln!("[unblurt] {}", format!($($arg)*));
        }
    };
}

fn plate_size() -> (f64, f64) {
    PLATE_SIZE.lock().map(|s| *s).unwrap_or((16.0, 176.0))
}

fn plate_pos() -> PlatePos {
    PLATE_POS.lock().map(|p| p.clone()).unwrap_or(PlatePos::DEFAULT)
}

fn area_of(m: &tauri::Monitor) -> Area {
    let a = m.work_area();
    Area { x: a.position.x, y: a.position.y, w: a.size.width as i32, h: a.size.height as i32 }
}

/// The screen the plate belongs on: the one it was dropped on if it's still connected, else the main one.
fn plate_monitor(app: &AppHandle, pos: &PlatePos) -> Option<tauri::Monitor> {
    let named = pos.monitor.as_ref().and_then(|name| {
        app.available_monitors().ok()?.into_iter().find(|m| m.name().is_some_and(|n| n == name))
    });
    named.or_else(|| app.primary_monitor().ok().flatten())
}

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

/// Puts the plate flush against its edge (left by default), at its saved spot along that edge.
/// Uses the size we last asked for: right after a resize the window can still report its old
/// size, which would leave a shrinking plate floating short of its edge.
fn place_plate(app: &AppHandle) {
    let Some(win) = plate(app) else { return };
    let pos = plate_pos();
    let monitor = plate_monitor(app, &pos).or_else(|| win.current_monitor().ok().flatten());
    let Some(m) = monitor else { return };
    let (lw, lh) = plate_size();
    let scale = m.scale_factor();
    let (w, h) = ((lw * scale).round() as i32, (lh * scale).round() as i32);
    let (x, y) = plate_pos::place(area_of(&m), w, h, pos.edge, pos.offset);
    debug_log!("place: {:?} {:.2} {}x{} -> {},{}", pos.edge, pos.offset, w, h, x, y);
    set_plate_frame(&win, (x, y), (lw, lh), scale);
}

/// Moves and resizes the plate in one go. Setting size and position separately shows a frame in
/// between where the window has its new size at its old spot, so the plate visibly jumps (most
/// of all on the right and bottom edges, where it grows away from its anchor).
/// `pos` is physical, `size` logical; `scale` converts between them.
fn set_plate_frame(win: &WebviewWindow, pos: (i32, i32), size: (f64, f64), scale: f64) {
    #[cfg(target_os = "macos")]
    if mac_set_frame(win, pos, size, scale) {
        return;
    }
    let _ = win.set_size(LogicalSize::new(size.0, size.1));
    let _ = win.set_position(PhysicalPosition::new(pos.0, pos.1));
}

#[cfg(target_os = "macos")]
fn mac_set_frame(win: &WebviewWindow, (x, y): (i32, i32), (w, h): (f64, f64), scale: f64) -> bool {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSScreen, NSWindow};
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    let Some(mtm) = MainThreadMarker::new() else { return false };
    let Ok(ptr) = win.ns_window() else { return false };
    if ptr.is_null() || scale <= 0.0 {
        return false;
    }
    // AppKit measures from the bottom-left of the main screen, in points
    let Some(main) = NSScreen::screens(mtm).firstObject() else { return false };
    let main_h = main.frame().size.height;
    let (lx, ly) = (x as f64 / scale, y as f64 / scale);
    // SAFETY: tauri hands out the live NSWindow behind this webview window; we're on the main thread.
    let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
    ns.setFrame_display(NSRect::new(NSPoint::new(lx, main_h - ly - h), NSSize::new(w, h)), true);
    true
}

/// Slides the plate from where it is to its spot on the edge instead of teleporting there.
/// Runs off the main thread; each step hops onto it. Calls `done` on the main thread at the end.
fn glide_plate(app: &AppHandle, done: impl FnOnce(&AppHandle) + Send + 'static) {
    let Some(win) = plate(app) else { return done(app) };
    let pos = plate_pos();
    let Some(m) = plate_monitor(app, &pos).or_else(|| win.current_monitor().ok().flatten()) else { return done(app) };
    let Ok(from) = win.outer_position() else { return done(app) };
    let (lw, lh) = plate_size();
    let scale = m.scale_factor();
    let (w, h) = ((lw * scale).round() as i32, (lh * scale).round() as i32);
    let to = plate_pos::place(area_of(&m), w, h, pos.edge, pos.offset);
    let from = (from.x, from.y);
    let app = app.clone();
    std::thread::spawn(move || {
        const STEPS: u32 = 12; // ~100ms at 8ms a step
        for i in 1..=STEPS {
            let t = i as f64 / STEPS as f64;
            let e = 1.0 - (1.0 - t).powi(3); // ease out
            let p = (
                (from.0 as f64 + (to.0 - from.0) as f64 * e).round() as i32,
                (from.1 as f64 + (to.1 - from.1) as f64 * e).round() as i32,
            );
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(w) = plate(&handle) {
                    set_plate_frame(&w, p, (lw, lh), scale);
                }
            });
            std::thread::sleep(Duration::from_millis(8));
        }
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || done(&handle));
    });
}

/// Where the plate was let go (the cursor at release, in physical pixels): snap to the nearest
/// edge (or corner) of that screen, remember it, tell the plate window (it saves the spot and
/// turns to fit the edge), and re-place it.
fn snap_plate(app: &AppHandle, (cx, cy): (f64, f64)) {
    let Some(win) = plate(app) else { return };
    let monitor = app.monitor_from_point(cx, cy).ok().flatten().or_else(|| win.current_monitor().ok().flatten());
    let Some(m) = monitor else { return };
    let (edge, offset) = plate_pos::snap(area_of(&m), cx, cy);
    debug_log!("snap: released at {cx:.0},{cy:.0} -> {edge:?} {offset:.2}");
    let pos = PlatePos { edge, offset, monitor: m.name().cloned() };
    if let Ok(mut cur) = PLATE_POS.lock() {
        *cur = pos.clone();
    }
    // glide there first, then tell the plate window, which turns to fit the edge and settles
    glide_plate(app, move |app| {
        let _ = app.emit_to("plate", "plate-moved", pos);
        place_plate(app);
    });
}

#[cfg(target_os = "macos")]
fn mouse_down() -> Option<bool> {
    Some(objc2_app_kit::NSEvent::pressedMouseButtons() & 1 == 1)
}
#[cfg(not(target_os = "macos"))]
fn mouse_down() -> Option<bool> {
    None
}

/// The plate's window never becomes key, so macOS doesn't send it hover events while another app
/// is active. Instead, watch the cursor and tell the plate where it is.
fn watch_plate_pointer(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<PlatePointer> = None;
        let mut tick: u32 = 0;
        loop {
            // ~250Hz, so hover reacts within a frame of the cursor arriving
            std::thread::sleep(Duration::from_millis(4));
            if !PLATE_ON.load(Ordering::Relaxed) {
                last = None;
                continue;
            }
            // keep note of the app you're working in, before a click on the plate activates us
            tick = tick.wrapping_add(1);
            if tick % 16 == 0 {
                front::track();
            }
            let Some(win) = plate(&app) else { continue };
            let (Ok(c), Ok(pos), Ok(scale)) = (app.cursor_position(), win.outer_position(), win.scale_factor()) else {
                continue;
            };
            let (hx, hy, hw, hh) = PLATE_HIT.lock().map(|h| *h).unwrap_or((0.0, 0.0, 0.0, 0.0));
            let (lx, ly) = ((c.x - pos.x as f64) / scale, (c.y - pos.y as f64) / scale);
            let inside = PLATE_DRAGGING.load(Ordering::Relaxed)
                || (lx >= hx && ly >= hy && lx < hx + hw && ly < hy + hh);
            // only the visible part takes the mouse (and dragged text)
            if last.as_ref().map(|l| l.inside) != Some(inside) {
                let _ = win.set_ignore_cursor_events(!inside);
            }
            let now = if inside {
                PlatePointer { inside, x: lx as i32, y: ly as i32 }
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

/// Opens the popover next to the plate, on the inside of whichever edge it's on, lined up with it
/// and kept on screen.
fn place_beside_plate(app: &AppHandle, win: &WebviewWindow) -> bool {
    let Some(p) = plate(app) else { return false };
    let (Ok(pp), Ok(ps), Ok(size), Some(m)) = (p.outer_position(), p.outer_size(), win.outer_size(), p.current_monitor().ok().flatten())
    else {
        return false;
    };
    let a = area_of(&m);
    let gap = (24.0 * m.scale_factor()) as i32;
    let (w, h) = (size.width as i32, size.height as i32);
    let clamp_x = |x: i32| x.clamp(a.x, (a.x + a.w - w).max(a.x));
    let clamp_y = |y: i32| y.clamp(a.y, (a.y + a.h - h).max(a.y));
    let (cx, cy) = (pp.x + ps.width as i32 / 2, pp.y + ps.height as i32 / 2);
    let (x, y) = match plate_pos().edge {
        Edge::Left => (a.x + gap, clamp_y(cy - h / 2)),
        Edge::Right => (a.x + a.w - w - gap, clamp_y(cy - h / 2)),
        Edge::Top => (clamp_x(cx - w / 2), a.y + gap),
        Edge::Bottom => (clamp_x(cx - w / 2), a.y + a.h - h - gap),
    };
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

/// Where the visible plate is inside its window (logical px). See `PLATE_HIT`.
#[tauri::command]
fn plate_hit(x: f64, y: f64, width: f64, height: f64) {
    if let Ok(mut h) = PLATE_HIT.lock() {
        *h = (x, y, width, height);
    }
}

/// Resizes the plate and re-pins it to the left edge, centred, so it grows and shrinks in place
/// whatever order the startup placement and the first resize arrive in.
#[tauri::command]
fn size_plate(app: AppHandle, width: f64, height: f64) {
    if plate(&app).is_none() {
        return;
    }
    if let Ok(mut s) = PLATE_SIZE.lock() {
        *s = (width, height);
    }
    place_plate(&app);
}

/// Grab the plate by its grip: it follows the cursor while the button is held, and when it's
/// released the plate snaps to the nearest edge or corner of that screen.
///
/// On macOS the app moves the window itself instead of handing it to the OS window-drag: the OS
/// drag can hold on to the window after the button goes up and override the snap.
#[tauri::command]
fn plate_drag(app: AppHandle) {
    let Some(win) = plate(&app) else { return };
    if PLATE_DRAGGING.swap(true, Ordering::SeqCst) {
        return;
    }
    let finish = |app: AppHandle, point: (f64, f64)| {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || snap_plate(&handle, point));
        // and once more after the glide, and after the window has settled into its new size
        std::thread::sleep(Duration::from_millis(300));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            place_plate(&handle);
            PLATE_DRAGGING.store(false, Ordering::SeqCst);
        });
    };

    if mouse_down().is_some() {
        // we can see the mouse button: follow the cursor ourselves
        let (Ok(c), Ok(p)) = (app.cursor_position(), win.outer_position()) else {
            PLATE_DRAGGING.store(false, Ordering::SeqCst);
            return;
        };
        let grab = (c.x - p.x as f64, c.y - p.y as f64);
        debug_log!("drag: follow cursor, grabbed at {grab:?}");
        std::thread::spawn(move || {
            let mut point = (c.x, c.y);
            for _ in 0..(120 * 60 * 2) {
                if mouse_down() != Some(true) {
                    break;
                }
                if let Ok(c) = app.cursor_position() {
                    if (c.x, c.y) == point {
                        std::thread::sleep(Duration::from_millis(8));
                        continue;
                    }
                    point = (c.x, c.y);
                    let (x, y) = ((c.x - grab.0).round() as i32, (c.y - grab.1).round() as i32);
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        if let Some(w) = plate(&handle) {
                            let _ = w.set_position(PhysicalPosition::new(x, y));
                        }
                    });
                }
                std::thread::sleep(Duration::from_millis(8));
            }
            debug_log!("drag: released at {point:?}");
            finish(app, point);
        });
        return;
    }

    // no access to the button state: let the OS drag the window, and snap once it holds still
    let _ = win.start_dragging();
    std::thread::spawn(move || {
        let mut last = None;
        let mut still = 0;
        for _ in 0..600 {
            std::thread::sleep(Duration::from_millis(40));
            let pos = plate(&app).and_then(|w| w.outer_position().ok());
            still = if pos.is_some() && pos == last { still + 1 } else { 0 };
            if still >= 10 {
                break;
            }
            last = pos;
        }
        let point = plate(&app).and_then(|w| {
            let (p, s) = (w.outer_position().ok()?, w.outer_size().ok()?);
            Some((p.x as f64 + s.width as f64 / 2.0, p.y as f64 + s.height as f64 / 2.0))
        });
        match point {
            Some(point) => finish(app, point),
            None => PLATE_DRAGGING.store(false, Ordering::SeqCst),
        }
    });
}

/// `edge`/`offset`/`monitor` come from the saved prefs; omitted ones keep the current value.
#[tauri::command]
fn set_plate(app: AppHandle, visible: bool, edge: Option<Edge>, offset: Option<f64>, monitor: Option<String>) {
    let Some(win) = plate(&app) else { return };
    if let Ok(mut pos) = PLATE_POS.lock() {
        if let Some(e) = edge {
            pos.edge = e;
        }
        if let Some(o) = offset {
            pos.offset = o.clamp(0.0, 1.0);
        }
        if edge.is_some() {
            pos.monitor = monitor;
        }
    }
    PLATE_ON.store(visible, Ordering::Relaxed);
    if visible {
        if let Ok(mut s) = PLATE_SIZE.lock() {
            *s = PLATE_WIN;
        }
        let _ = win.set_ignore_cursor_events(true);
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
            plate_hit,
            plate_drag,
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
