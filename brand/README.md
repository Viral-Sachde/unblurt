<p align="center"><img src="mark.svg" width="72" alt="unblurt mark" /></p>

<h1 align="center">unblurt brand kit</h1>

<p align="center">Everything that makes unblurt look like unblurt.</p>

---

## Palette

| | Name | Hex | Use |
|---|---|---|---|
| ![](https://img.shields.io/badge/-%20%20%20%20-0F6B6A?style=flat-square) | Petrol teal | `#0F6B6A` | Primary. Buttons, the active mode, the logo body |
| ![](https://img.shields.io/badge/-%20%20%20%20-FF7A45?style=flat-square) | Persimmon | `#FF7A45` | Accent. The dot, the shift key, text selections |
| ![](https://img.shields.io/badge/-%20%20%20%20-EDE6DD?style=flat-square) | Warm stone | `#EDE6DD` | Canvas behind illustrations and product shots |
| ![](https://img.shields.io/badge/-%20%20%20%20-101010?style=flat-square) | Ink | `#101010` | Text |

Supporting tints: teal tint `#E3EFEE` (result box), persimmon tint `#FFD7C4` (selected text), stone soft `#F6F2EC`, cream `#FBF8F4`.

**Type:** [Inter](https://rsms.me/inter/), weight 500 with tight tracking (about -0.04em) for headlines, 400 for body. Manrope is the fallback.

**Voice:** lowercase, short and a bit dry. *messy thoughts. clear writing.* · *your brain, unfiltered.* · *your words, sorted.* No em dashes anywhere; use a comma, colon or full stop instead.

## Files

| File | What it is |
|---|---|
| [`logo.mjs`](logo.mjs) | Source of truth for the logo. `node brand/logo.mjs` writes every file below plus the desktop `Mark.tsx` |
| [`mark.svg`](mark.svg) | The logo: a highlighted selection and a text cursor (Caret, polished) |
| [`app-icon.svg`](app-icon.svg) | 1024px app icon: the Caret on a teal tile. Run `npm run icons` in `apps/desktop` to rebuild every platform size |
| [`tray.svg`](tray.svg) | Single-colour template icon for the macOS menu bar and the system tray |
| [`illustrations.mjs`](illustrations.mjs) | Generates the isometric keycap illustration: `node brand/illustrations.mjs apps/web/assets` |
| [`creatives/`](creatives) | Product shots, README banner and social preview image |

## Logo

<p>
  <img src="app-icon.svg" width="128" alt="unblurt app icon" />
  &nbsp;&nbsp;
  <img src="mark.svg" width="128" alt="unblurt mark" />
</p>

A highlighted selection and a text cursor: select text, and unblurt takes it from there. The app icon puts it on a teal tile; everywhere else uses the bare mark.

To change the logo, edit `logo.mjs` and run `node brand/logo.mjs`. Then run `npm run icons` in `apps/desktop` and `creatives/render.sh` to rebuild the app icons and creatives.

## Creatives

The product shots show the real flow: messy text selected in an ordinary app, `⌘ ⇧ Space`, and the unblurt popover with the clean version ready to paste. They're plain HTML, so the copy is easy to change.

| File | Size | Used for |
|---|---|---|
| `creatives/product.html#message` | 1200×720 @2x | Website hero |
| `creatives/product.html#email` `#rephrase` `#fix` `#reply` | 1200×840 @2x | Website showreel, README |
| `creatives/banner.html` | 1280×640 @2x | README banner, `og:image` |

To add a scene, add an entry to the `S` object in `product.html`. Then run:

```bash
brand/creatives/render.sh   # renders everything with headless Chrome and copies it to apps/web/assets
```
