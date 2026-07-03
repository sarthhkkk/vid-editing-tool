# Vid Crop Tool

<p>
  <a href="https://github.com/sarthhkkk/vid-editing-tool/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
  <img src="https://img.shields.io/badge/FFmpeg.wasm-v0.11.6-6c8cff" alt="FFmpeg.wasm">
  <img src="https://img.shields.io/badge/no%20backend-✓-brightgreen" alt="no backend">
</p>

Web-based video cropping and trimming tool — fully client-side, no uploads, no servers.

## Features

- **Crop** — draggable, resizable crop box with 8 handles. 4-segment dimmer shows the excluded area.
- **Trim** — start/end range sliders with auto-cross prevention and auto-pause at end marker.
- **Aspect Ratio** — 1:1, 16:9, 4:3, 3:2, 3:4, 9:16 presets with lock. Auto-detects the original ratio on load.
- **Rotation** — 90° CW/CCW, horizontal/vertical flip. Applied in the export filter chain.
- **Preview** — live cropped region rendered to canvas, updates in real-time.
- **Export** — MP4, WebM, or GIF. Progress bar tracks ffmpeg encode time.
- **Keyboard** — `Space` play/pause, `Escape` toggle crop overlay.
- **Dark theme** — Aurora Glass.

## How it works

1. Drop or browse to select a video file.
2. Adjust the crop box, trim sliders, rotation, and aspect ratio.
3. Click Export — FFmpeg.wasm (~30MB) downloads on first use, then the video is encoded entirely in your browser.
4. The cropped file downloads automatically.

## Setup

### Option 1: Clone from GitHub

```bash
git clone https://github.com/sarthhkkk/vid-editing-tool.git
cd vid-editing-tool
python -m http.server 5500
```

Open http://localhost:5500 in your browser.

### Option 2: Download ZIP

Download the repo as a ZIP, extract it, and serve it:

```bash
cd path/to/vid-editing-tool
python -m http.server 5500
```

### Option 3: Any static server

This works with any static file server:

```bash
# Python
python -m http.server 5500

# Node (if you have npx)
npx serve .

# Or just open index.html directly (works in most browsers)
```

No installation, no `npm install`, no build step. Just serve the files.

## Tech stack

- [FFmpeg.wasm](https://github.com/nicedoc/ffmpegwasm) v0.11.6 — runs FFmpeg in the browser via WebAssembly
- Plain HTML/CSS/JS — no build step, no framework, no backend

## Browser support

Chrome, Firefox, Edge, Safari (latest versions). FFmpeg core is ~30MB and loads from CDN on first export.

## License

MIT
