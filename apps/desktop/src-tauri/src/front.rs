//! Remembers which app was in front before unblurt, so focus can go straight back to it.
//!
//! Clicking the plate activates unblurt (macOS does that for any click, even on a window that
//! never takes keyboard focus), so "the frontmost app" at action time is unblurt itself. That's why
//! the last other frontmost app is tracked continuously while the plate is up.
//!
//! On macOS, hiding a window doesn't reactivate the previous app. Hiding the whole app does, but
//! that also hides the plate. So instead: note the frontmost app when we summon, and activate it
//! again when we're done.

#[cfg(target_os = "macos")]
mod imp {
    use std::sync::atomic::{AtomicI32, Ordering};

    use objc2::runtime::NSObjectProtocol;
    use objc2::{sel, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSApplicationActivationOptions, NSRunningApplication, NSWorkspace};
    use tauri::AppHandle;

    static PREVIOUS: AtomicI32 = AtomicI32::new(0);

    pub fn remember() {
        let me = std::process::id() as i32;
        if let Some(app) = NSWorkspace::sharedWorkspace().frontmostApplication() {
            let pid = app.processIdentifier();
            if pid != me {
                PREVIOUS.store(pid, Ordering::Relaxed);
            }
        }
    }

    /// Brings the previous app back to the front, unless it already is (the plate never takes
    /// focus, so after a plate action it often still is).
    ///
    /// First asks macOS directly. If that app still isn't in front a moment later, falls back to
    /// hiding unblurt (which always hands focus back) and then un-hiding without activating, so the
    /// plate comes straight back while focus stays where it went.
    pub fn restore(app: &AppHandle) {
        let pid = PREVIOUS.load(Ordering::Relaxed);
        if pid == 0 {
            return;
        }
        let _ = app.run_on_main_thread(move || {
            let Some(mtm) = MainThreadMarker::new() else { return };
            let Some(prev) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) else { return };
            if prev.isActive() {
                return;
            }
            let me = NSApplication::sharedApplication(mtm);
            if me.respondsToSelector(sel!(yieldActivationToApplication:)) {
                // macOS 14+: hand activation over, then activate it on our behalf
                me.yieldActivationToApplication(&prev);
                prev.activateFromApplication_options(
                    &NSRunningApplication::currentApplication(),
                    NSApplicationActivationOptions::empty(),
                );
            } else {
                prev.activateWithOptions(NSApplicationActivationOptions::empty());
            }
        });

        let handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            let _ = handle.run_on_main_thread(move || {
                let Some(mtm) = MainThreadMarker::new() else { return };
                let back = NSRunningApplication::runningApplicationWithProcessIdentifier(pid).is_some_and(|p| p.isActive());
                if back {
                    return;
                }
                let me = NSApplication::sharedApplication(mtm);
                me.hide(None);
                me.unhideWithoutActivation();
            });
        });
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    // Windows and Linux hand focus back when the popover hides.
    pub fn remember() {}
    #[allow(dead_code)]
    pub fn restore(_app: &tauri::AppHandle) {}
}

pub use imp::{remember as track, remember, restore};
