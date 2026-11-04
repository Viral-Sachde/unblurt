# Changelog

All notable changes to the unblurt desktop app. Versions follow [semver](https://semver.org).
Each release on GitHub uses its section below as the release notes.

## [0.1.0] - 2026-11-04

The first release.

### The popover
- Select text anywhere, press `⌘⇧Space` (`Ctrl+Shift+Space` on Windows and Linux), get it back written properly.
- Seven modes: Rephrase, Email, Message, Reply, Shorter, Fix and Ask. Five tones (casual, neutral, warm, direct, formal), `⌘T` to cycle.
- `↵` to run, `↵` again to paste it back where you were. `⌘C` copy, `⌘R` again, `⌘E` back to edit, `esc` to close.
- Add a short note to steer the rewrite.

### The plate
- A slim tab on the edge of your screen. Drag selected text onto it to open unblurt with that text.
- Hover it for quick actions: Rephrase, Shorter, or start from the clipboard.
- Drag it by its grip to any side or corner of any screen. It remembers where you put it.
- Fast and smooth: a fixed-size window that animates on the GPU, lets clicks through everywhere except the plate itself, and reacts to the cursor within a frame.

### Settings
- Record any global shortcut.
- Pick the model and default tone, check the engine, show or hide the plate.
- Shows the app version.

### Engine
- Runs a private local [opencode](https://opencode.ai) server, which sends your text to the model provider you connected (or a model on your own machine). unblurt itself collects nothing.
