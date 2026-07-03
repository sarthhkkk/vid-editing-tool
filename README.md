# Vid Crop Tool

<p>
  <a href="https://github.com/sarthhkkk/vid-editing-tool/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
  <img src="https://img.shields.io/badge/FFmpeg.wasm-v0.11.6-6c8cff" alt="FFmpeg.wasm">
  <img src="https://img.shields.io/badge/no%20backend-✓-brightgreen" alt="no backend">
</p>

Web-based video cropping and trimming tool — fully client-side, no uploads, no servers.

## Features

- **Upload** — drag & drop or browse to select a video file. MP4, WebM, MOV, AVI supported.
- **Crop** — draggable, resizable crop box with 8 corner/edge handles. 4-segment dimmer highlights the excluded area. Manual X, Y, Width, Height numeric inputs for precise control.
- **Trim** — start/end range sliders with auto-cross prevention and auto-pause at end marker. Time display in `m:ss` format.
- **Aspect Ratio** — Free, 1:1, 16:9, 4:3, 3:2, 3:4, 9:16 presets with lock (constrains crop resize to maintain ratio).
- **Auto Detect** — on load, automatically identifies the original video aspect ratio (highlights matching preset) and resolution quality (SD / HD / Full HD / 4K).
- **Rotation & Flip** — 90° CW, 90° CCW, horizontal flip, vertical flip. Applied in the export filter chain. Rotation badge shows current state.
- **Live Preview** — cropped region rendered to canvas in real-time. Updates on seek, time update, and crop change. Shows exact output pixel dimensions.
- **Export** — MP4, WebM, or GIF. FFmpeg.wasm core (~30MB) auto-downloads on first export and caches in browser. Progress bar tracks encode time via ffmpeg log output. File downloads automatically when done.
- **Error Handling** — clear messages for unsupported formats, corrupt files, and load timeouts. 30-second metadata timeout.
- **Keyboard Shortcuts** — `Space` play/pause, `Escape` toggle crop overlay.
- **Double-click** on crop area toggles play/pause.
- **Responsive** — two-column layout on desktop, stacks vertically on mobile (≤768px).
- **Dark Theme** — Aurora Glass design. No light mode.

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
