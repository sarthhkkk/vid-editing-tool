const state = {
  videoFile: null,
  videoUrl: null,
  videoWidth: 0,
  videoHeight: 0,
  duration: 0,
  crop: { x: 15, y: 10, w: 70, h: 80 },
  trim: { start: 0, end: 100 },
  ffmpeg: null,
  ffmpegLoaded: false,
  isProcessing: false,
  dragging: null,
  dragStart: null,
  cropStart: null,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const dom = {
  dropZone: $('#drop-zone'),
  fileInput: $('#file-input'),
  browseLink: $('#browse-link'),
  uploadSection: $('#upload-section'),
  editorSection: $('#editor-section'),
  video: $('#video-player'),
  videoContainer: $('#video-container'),
  cropOverlay: $('#crop-overlay'),
  cropBox: $('#crop-box'),
  trimStart: $('#trim-start'),
  trimEnd: $('#trim-end'),
  trimStartTime: $('#trim-start-time'),
  trimEndTime: $('#trim-end-time'),
  cropX: $('#crop-x'),
  cropY: $('#crop-y'),
  cropW: $('#crop-w'),
  cropH: $('#crop-h'),
  resetCrop: $('#reset-crop'),
  exportBtn: $('#export-btn'),
  btnText: $('#export-btn .btn-text'),
  btnLoader: $('#export-btn .btn-loader'),
  outputFormat: $('#output-format'),
  progressSection: $('#progress-section'),
  progressFill: $('#progress-fill'),
  progressText: $('#progress-text'),
};

let overlaySegments = [];

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ── File Upload ── */

dom.dropZone.addEventListener('click', () => dom.fileInput.click());

dom.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dom.dropZone.classList.add('drag-over');
});

dom.dropZone.addEventListener('dragleave', () => {
  dom.dropZone.classList.remove('drag-over');
});

dom.dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dom.dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadVideo(file);
});

dom.fileInput.addEventListener('change', () => {
  if (dom.fileInput.files[0]) loadVideo(dom.fileInput.files[0]);
});

/* ── Video Loading ── */

function loadVideo(file) {
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);

  state.videoFile = file;
  state.videoUrl = URL.createObjectURL(file);
  dom.video.src = state.videoUrl;

  dom.uploadSection.hidden = true;
  dom.editorSection.hidden = false;
  dom.exportBtn.disabled = true;
  dom.exportBtn.textContent = 'Loading...';

  state.video.addEventListener(
    'loadedmetadata',
    () => {
      state.videoWidth = dom.video.videoWidth;
      state.videoHeight = dom.video.videoHeight;
      state.duration = dom.video.duration;
      dom.exportBtn.disabled = false;
      dom.exportBtn.textContent = 'Export Video';

      fitVideoContainer();
      initCropOverlay();
      initTrimControls();
      syncDimensionInputs();
      updateTrimDisplay();
    },
    { once: true }
  );
}

function fitVideoContainer() {
  const maxW = dom.videoContainer.clientWidth;
  const maxH = Math.min(480, maxW / (state.videoWidth / state.videoHeight));
  const aspect = state.videoWidth / state.videoHeight;

  let w, h;
  if (maxW / aspect > maxH) {
    h = maxH;
    w = h * aspect;
  } else {
    w = maxW;
    h = w / aspect;
  }

  dom.video.width = w;
  dom.video.height = h;
  dom.videoContainer.style.cssText = `width:${w}px;height:${h}px;`;
}

/* ── Crop Overlay ── */

function initCropOverlay() {
  dom.cropOverlay.style.display = 'block';
  dom.cropBox.style.display = 'block';

  recreateOverlaySegments();
  updateCropBox();
  updateOverlaySegments();

  dom.cropBox.addEventListener('pointerdown', onCropPointerDown);
  document.addEventListener('pointermove', onCropPointerMove);
  document.addEventListener('pointerup', onCropPointerUp);

  dom.cropBox.querySelectorAll('.crop-handle').forEach((h) => {
    h.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      state.dragging = h.classList.contains('nw')
        ? 'nw'
        : h.classList.contains('n')
        ? 'n'
        : h.classList.contains('ne')
        ? 'ne'
        : h.classList.contains('e')
        ? 'e'
        : h.classList.contains('se')
        ? 'se'
        : h.classList.contains('s')
        ? 's'
        : h.classList.contains('sw')
        ? 'sw'
        : h.classList.contains('w')
        ? 'w'
        : null;
      state.dragStart = { x: e.clientX, y: e.clientY };
      state.cropStart = { ...state.crop };
      dom.cropBox.setPointerCapture(e.pointerId);
    });
  });
}

function recreateOverlaySegments() {
  overlaySegments.forEach((s) => s.remove());
  overlaySegments = [];

  for (const pos of ['top', 'bottom', 'left', 'right']) {
    const el = document.createElement('div');
    el.className = 'crop-segment';
    el.style.cssText =
      'position:absolute;background:rgba(0,0,0,0.55);pointer-events:none;z-index:1;';
    dom.cropOverlay.appendChild(el);
    overlaySegments.push(el);
  }
}

function getContainerDim() {
  const r = dom.videoContainer.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

function updateCropBox() {
  const { w, h } = getContainerDim();
  const { x, y, w: cw, h: ch } = state.crop;

  dom.cropBox.style.cssText = `
    position:absolute;
    left:${(x / 100) * w}px;
    top:${(y / 100) * h}px;
    width:${(cw / 100) * w}px;
    height:${(ch / 100) * h}px;
    border:2px solid #fff;
    cursor:move;
    pointer-events:auto;
    z-index:2;
  `;

  syncDimensionInputs();
}

function updateOverlaySegments() {
  const { w, h } = getContainerDim();
  const { x, y, w: cw, h: ch } = state.crop;

  const px = (v) => (v / 100) * w;
  const py = (v) => (v / 100) * h;

  const cLeft = px(x);
  const cTop = py(y);
  const cRight = px(x + cw);
  const cBottom = py(y + ch);

  const positions = [
    { l: 0, t: 0, w: w, h: cTop },
    { l: 0, t: cBottom, w: w, h: h - cBottom },
    { l: 0, t: cTop, w: cLeft, h: ch },
    { l: cRight, t: cTop, w: w - cRight, h: ch },
  ];

  overlaySegments.forEach((el, i) => {
    const p = positions[i];
    el.style.cssText = `
      position:absolute;
      left:${p.l}px;
      top:${p.t}px;
      width:${p.w}px;
      height:${p.h}px;
      background:rgba(0,0,0,0.55);
      pointer-events:none;
      z-index:1;
    `;
  });
}

function syncDimensionInputs() {
  dom.cropX.value = Math.round(state.crop.x);
  dom.cropY.value = Math.round(state.crop.y);
  dom.cropW.value = Math.round(state.crop.w);
  dom.cropH.value = Math.round(state.crop.h);
}

function onCropPointerDown(e) {
  if (e.target.classList.contains('crop-handle')) return;
  state.dragging = 'move';
  state.dragStart = { x: e.clientX, y: e.clientY };
  state.cropStart = { ...state.crop };
  dom.cropBox.setPointerCapture(e.pointerId);
}

function onCropPointerMove(e) {
  if (!state.dragging || !state.dragStart) return;

  const dx = e.clientX - state.dragStart.x;
  const dy = e.clientY - state.dragStart.y;
  const { w, h } = getContainerDim();

  const dxPct = (dx / w) * 100;
  const dyPct = (dy / h) * 100;

  let c = { ...state.cropStart };

  switch (state.dragging) {
    case 'move':
      c.x = clamp(state.cropStart.x + dxPct, 0, 100 - c.w);
      c.y = clamp(state.cropStart.y + dyPct, 0, 100 - c.h);
      break;
    case 'se':
      c.w = clamp(state.cropStart.w + dxPct, 5, 100 - c.x);
      c.h = clamp(state.cropStart.h + dyPct, 5, 100 - c.y);
      break;
    case 'nw':
      c.w = clamp(state.cropStart.w - dxPct, 5, state.cropStart.x + state.cropStart.w);
      c.h = clamp(state.cropStart.h - dyPct, 5, state.cropStart.y + state.cropStart.h);
      c.x = clamp(state.cropStart.x + dxPct, 0, state.cropStart.x + state.cropStart.w - 5);
      c.y = clamp(state.cropStart.y + dyPct, 0, state.cropStart.y + state.cropStart.h - 5);
      break;
    case 'ne':
      c.w = clamp(state.cropStart.w + dxPct, 5, 100 - c.x);
      c.h = clamp(state.cropStart.h - dyPct, 5, state.cropStart.y + state.cropStart.h);
      c.y = clamp(state.cropStart.y + dyPct, 0, state.cropStart.y + state.cropStart.h - 5);
      break;
    case 'sw':
      c.w = clamp(state.cropStart.w - dxPct, 5, state.cropStart.x + state.cropStart.w);
      c.h = clamp(state.cropStart.h + dyPct, 5, 100 - c.y);
      c.x = clamp(state.cropStart.x + dxPct, 0, state.cropStart.x + state.cropStart.w - 5);
      break;
    case 'n':
      c.h = clamp(state.cropStart.h - dyPct, 5, state.cropStart.y + state.cropStart.h);
      c.y = clamp(state.cropStart.y + dyPct, 0, state.cropStart.y + state.cropStart.h - 5);
      break;
    case 's':
      c.h = clamp(state.cropStart.h + dyPct, 5, 100 - c.y);
      break;
    case 'w':
      c.w = clamp(state.cropStart.w - dxPct, 5, state.cropStart.x + state.cropStart.w);
      c.x = clamp(state.cropStart.x + dxPct, 0, state.cropStart.x + state.cropStart.w - 5);
      break;
    case 'e':
      c.w = clamp(state.cropStart.w + dxPct, 5, 100 - c.x);
      break;
  }

  state.crop = c;
  updateCropBox();
  updateOverlaySegments();
}

function onCropPointerUp() {
  state.dragging = null;
  state.dragStart = null;
  state.cropStart = null;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/* ── Dimension Inputs ── */

function updateCropFromInputs() {
  const x = parseFloat(dom.cropX.value);
  const y = parseFloat(dom.cropY.value);
  const w = parseFloat(dom.cropW.value);
  const h = parseFloat(dom.cropH.value);

  if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) return;

  state.crop.x = clamp(x, 0, 100 - w);
  state.crop.y = clamp(y, 0, 100 - h);
  state.crop.w = clamp(w, 5, 100 - state.crop.x);
  state.crop.h = clamp(h, 5, 100 - state.crop.y);

  updateCropBox();
  updateOverlaySegments();
}

dom.cropX.addEventListener('input', updateCropFromInputs);
dom.cropY.addEventListener('input', updateCropFromInputs);
dom.cropW.addEventListener('input', updateCropFromInputs);
dom.cropH.addEventListener('input', updateCropFromInputs);

dom.resetCrop.addEventListener('click', () => {
  state.crop = { x: 15, y: 10, w: 70, h: 80 };
  updateCropBox();
  updateOverlaySegments();
});

/* ── Trim Controls ── */

function initTrimControls() {
  const dur = state.duration;

  dom.trimStart.min = 0;
  dom.trimStart.max = 100;
  dom.trimStart.value = 0;
  dom.trimStart.step = 0.1;

  dom.trimEnd.min = 0;
  dom.trimEnd.max = 100;
  dom.trimEnd.value = 100;
  dom.trimEnd.step = 0.1;

  dom.trimStart.addEventListener('input', () => {
    if (parseFloat(dom.trimStart.value) >= parseFloat(dom.trimEnd.value)) {
      dom.trimStart.value = Math.max(0, parseFloat(dom.trimEnd.value) - 1);
    }
    state.trim.start = parseFloat(dom.trimStart.value);
    updateTrimDisplay();
  });

  dom.trimEnd.addEventListener('input', () => {
    if (parseFloat(dom.trimEnd.value) <= parseFloat(dom.trimStart.value)) {
      dom.trimEnd.value = Math.min(100, parseFloat(dom.trimStart.value) + 1);
    }
    state.trim.end = parseFloat(dom.trimEnd.value);
    updateTrimDisplay();
  });

  dom.video.addEventListener('timeupdate', () => {
    if (dom.video.currentTime >= (state.trim.end / 100) * state.duration) {
      dom.video.pause();
    }
  });
}

function updateTrimDisplay() {
  const dur = state.duration;
  const tStart = (state.trim.start / 100) * dur;
  const tEnd = (state.trim.end / 100) * dur;
  dom.trimStartTime.textContent = formatTime(tStart);
  dom.trimEndTime.textContent = formatTime(tEnd);
}

/* ── Export ── */

dom.exportBtn.addEventListener('click', exportVideo);

async function exportVideo() {
  if (state.isProcessing) return;
  state.isProcessing = true;
  dom.exportBtn.disabled = true;
  dom.btnText.textContent = 'Processing...';
  dom.btnLoader.hidden = false;
  dom.progressSection.hidden = false;
  dom.progressFill.style.width = '0%';
  dom.progressText.textContent = 'Loading FFmpeg...';

  try {
    await loadFFmpeg();

    const format = dom.outputFormat.value;
    const inName = `input${getExt(state.videoFile.name)}`;
    const outName = `output.${format}`;

    dom.progressText.textContent = 'Reading video...';
    dom.progressFill.style.width = '10%';

    ffmpeg.FS('writeFile', inName, await FFmpegWASM.fetchFile(state.videoFile));

    const args = ['-i', inName, '-y'];

    const { w, h, x, y } = getCropPixels();
    if (w < state.videoWidth || h < state.videoHeight || x > 0 || y > 0) {
      args.push('-vf', `crop=${w}:${h}:${x}:${y}`);
    }

    const tStart = (state.trim.start / 100) * state.duration;
    const tEnd = (state.trim.end / 100) * state.duration;
    if (tStart > 0) {
      args.push('-ss', tStart.toFixed(2));
    }
    if (tEnd < state.duration) {
      args.push('-to', tEnd.toFixed(2));
    }

    let codecArgs;
    if (format === 'webm') {
      codecArgs = ['-c:v', 'libvpx-vp9', '-b:v', '1M', '-c:a', 'libopus'];
    } else if (format === 'gif') {
      codecArgs = ['-vf', `fps=10,scale=${Math.min(w, 480)}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`];
    } else {
      codecArgs = ['-preset', 'fast', '-c:a', 'aac'];
    }
    args.push(...codecArgs, outName);

    dom.progressText.textContent = 'Processing video...';
    dom.progressFill.style.width = '20%';

    ffmpeg.setLogger(({ type, msg }) => {
      if (type === 'fferr') {
        const match = msg.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (match) {
          const elapsed = parseTimeToSeconds(match[1]);
          const duration = tEnd - tStart || state.duration;
          const pct = Math.min(95, 20 + (elapsed / duration) * 75);
          dom.progressFill.style.width = `${pct}%`;
          dom.progressText.textContent = `Processing... ${Math.round(pct)}%`;
        }
      }
    });

    await ffmpeg.exec(args);

    dom.progressFill.style.width = '100%';
    dom.progressText.textContent = 'Finalizing...';

    const data = ffmpeg.FS('readFile', outName);
    const blob = new Blob([data.buffer], { type: getMimeType(format) });
    downloadBlob(blob, `cropped_${outName}`);

    dom.progressText.textContent = 'Done!';
    setTimeout(() => {
      dom.progressSection.hidden = true;
    }, 2000);
  } catch (err) {
    dom.progressText.textContent = `Error: ${err.message}`;
    console.error(err);
  } finally {
    state.isProcessing = false;
    dom.exportBtn.disabled = false;
    dom.btnText.textContent = 'Export Video';
    dom.btnLoader.hidden = true;
  }
}

async function loadFFmpeg() {
  if (state.ffmpegLoaded) return;

  if (typeof FFmpegWASM === 'undefined') {
    throw new Error('FFmpeg failed to load. Check your internet connection.');
  }

  const { createFFmpeg } = FFmpegWASM;
  state.ffmpeg = createFFmpeg({ log: true, corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js' });

  dom.progressText.textContent = 'Downloading FFmpeg (~30MB first time)...';

  await state.ffmpeg.load();
  state.ffmpegLoaded = true;
  dom.progressText.textContent = 'FFmpeg ready!';
}

function getCropPixels() {
  const vw = state.videoWidth;
  const vh = state.videoHeight;
  return {
    x: Math.round((state.crop.x / 100) * vw),
    y: Math.round((state.crop.y / 100) * vh),
    w: Math.round((state.crop.w / 100) * vw),
    h: Math.round((state.crop.h / 100) * vh),
  };
}

function getExt(name) {
  const i = name.lastIndexOf('.');
  return i > -1 ? name.slice(i) : '.mp4';
}

function getMimeType(fmt) {
  const map = { mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif' };
  return map[fmt] || 'video/mp4';
}

function parseTimeToSeconds(t) {
  const parts = t.split(':');
  return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Initialize ── */

dom.editorSection.hidden = true;

window.addEventListener('resize', () => {
  if (!state.videoFile) return;
  fitVideoContainer();
  updateCropBox();
  updateOverlaySegments();
});
