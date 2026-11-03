//! Talking to whatever app the user was in: read their selection, paste our result.
//! Both work by simulating the platform copy/paste chord, which is what Wispr-style
//! tools do too. macOS asks for Accessibility permission the first time.

use std::sync::{Mutex, OnceLock};
use std::thread::sleep;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};

#[cfg(target_os = "macos")]
const MODIFIER: Key = Key::Meta;
#[cfg(not(target_os = "macos"))]
const MODIFIER: Key = Key::Control;

// On Linux/X11 the clipboard contents die with the `Clipboard` that set them,
// so one instance is kept alive for the life of the app.
fn clipboard() -> Result<&'static Mutex<Clipboard>, String> {
    static CLIPBOARD: OnceLock<Mutex<Clipboard>> = OnceLock::new();
    if let Some(c) = CLIPBOARD.get() {
        return Ok(c);
    }
    let c = Clipboard::new().map_err(|e| e.to_string())?;
    Ok(CLIPBOARD.get_or_init(|| Mutex::new(c)))
}

fn chord(c: char) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    // The hotkey's own modifiers may still be physically held; without releasing them
    // the target app would see e.g. Cmd+Shift+C instead of Cmd+C.
    let _ = enigo.key(Key::Shift, Direction::Release);
    #[cfg(target_os = "macos")]
    let _ = enigo.key(Key::Option, Direction::Release);
    enigo.key(MODIFIER, Direction::Press).map_err(|e| e.to_string())?;
    let clicked = enigo.key(Key::Unicode(c), Direction::Click);
    enigo.key(MODIFIER, Direction::Release).map_err(|e| e.to_string())?;
    clicked.map_err(|e| e.to_string())
}

pub fn copy(text: &str) -> Result<(), String> {
    let mut cb = clipboard()?.lock().map_err(|e| e.to_string())?;
    cb.set_text(text.to_owned()).map_err(|e| e.to_string())
}

/// Returns the text currently selected in the frontmost app, or "" if nothing is.
/// The user's clipboard is restored afterwards (text only).
pub fn grab_selection() -> Result<String, String> {
    let mut cb = clipboard()?.lock().map_err(|e| e.to_string())?;
    let previous = cb.get_text().ok();

    // A unique marker tells "nothing was selected" apart from "the selection equals the old clipboard".
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let marker = format!("\u{2063}unblurt:{nonce}");
    cb.set_text(marker.clone()).map_err(|e| e.to_string())?;

    sleep(Duration::from_millis(90));
    chord('c')?;

    let mut grabbed = String::new();
    for _ in 0..16 {
        sleep(Duration::from_millis(25));
        if let Ok(t) = cb.get_text() {
            if t != marker {
                grabbed = t;
                break;
            }
        }
    }

    match previous {
        Some(p) => cb.set_text(p).map_err(|e| e.to_string())?,
        None => cb.clear().map_err(|e| e.to_string())?,
    }
    Ok(grabbed)
}

/// Whatever text is on the clipboard right now ("" if none).
pub fn clipboard_text() -> String {
    clipboard().ok().and_then(|c| c.lock().ok().and_then(|mut cb| cb.get_text().ok())).unwrap_or_default()
}

/// Puts `text` on the clipboard and pastes it into whatever app has focus.
/// The result stays on the clipboard so it can be pasted again.
pub fn paste(text: &str) -> Result<(), String> {
    copy(text)?;
    sleep(Duration::from_millis(60));
    chord('v')
}
