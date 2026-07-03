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
  aspectLocked: false,
  aspectRatio: null,
  rotation: 0,
  hflip: false,
  vflip: false,
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
  aspectBtns: $$('.aspect-btn'),
  rotateCw: $('#rotate-cw'),
  rotateCcw: $('#rotate-ccw'),
  flipH: $('#flip-h'),
  flipV: $('#flip-v'),
  rotationBadge: $('#rotation-badge'),
  previewCanvas: $('#preview-canvas'),
  previewDim: $('#preview-dim-label'),
  exportBtn: $('#export-btn'),
  btnText: $('#export-btn .btn-text'),
  btnLoader: $('#export-btn .btn-loader'),
  outputFormat: $('#output-format'),
  progressSection: $('#progress-section'),
  progressFill: $('#progress-fill'),
  progressText: $('#progress-text'),
};

let overlaySegments = [];
let previewAnimId = null;

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

let _loadCancel = false;

function loadVideo(file) {
  _loadCancel = true;

  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);

  state.videoFile = file;
  state.videoUrl = URL.createObjectURL(file);

  dom.uploadSection.hidden = true;
  dom.editorSection.hidden = false;
  dom.exportBtn.disabled = true;
  dom.exportBtn.textContent = 'Loading...';

  _loadCancel = false;

  const onMeta = () => {
    if (_loadCancel) return;
    state.videoWidth = dom.video.videoWidth;
    state.videoHeight = dom.video.videoHeight;
    state.duration = dom.video.duration;
    dom.exportBtn.disabled = false;
    dom.exportBtn.textContent = 'Export Video';

    fitVideoContainer();
    initCropOverlay();
    initTrimControls();
    initAspectControls();
    initRotationControls();
    syncDimensionInputs();
    updateTrimDisplay();
    updatePreview();
  };

  const onError = () => {
    if (_loadCancel) return;
    dom.exportBtn.disabled = false;
    dom.exportBtn.textContent = 'Error loading video';
    dom.progressSection.hidden = false;
    dom.progressText.textContent = 'Unsupported or corrupted file. Try a different video.';
  };

  state.video.addEventListener('loadedmetadata', onMeta, { once: true });
  state.video.addEventListener('error', onError, { once: true });

  const loadTimeout = setTimeout(() => {
    if (_loadCancel) return;
    _loadCancel = true;
    dom.exportBtn.disabled = false;
    dom.exportBtn.textContent = 'Video load timed out';
    dom.progressSection.hidden = false;
    dom.progressText.textContent = 'The file is too large or in an unsupported format. Try a smaller MP4 file.';
  }, 30000);

  const clearTimer = () => { clearTimeout(loadTimeout); };
  state.video.addEventListener('loadedmetadata', clearTimer, { once: true });
  state.video.addEventListener('error', clearTimer, { once: true });

  dom.video.src = state.videoUrl;
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
  updateOverlaySegments();
  updatePreview();
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

  c = constrainAspect(c, state.dragging);
  state.crop = c;
  updateCropBox();
}

function onCropPointerUp() {
  state.dragging = null;
  state.dragStart = null;
  state.cropStart = null;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/* ── Aspect Ratio ── */

function initAspectControls() {
  dom.aspectBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      dom.aspectBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const val = btn.dataset.ratio;
      if (!val) {
        state.aspectLocked = false;
        state.aspectRatio = null;
        return;
      }

      const parts = val.split(':');
      state.aspectRatio = parseInt(parts[0]) / parseInt(parts[1]);
      state.aspectLocked = true;

      snapToAspectRatio();
    });
  });
}

function snapToAspectRatio() {
  if (!state.aspectLocked || !state.aspectRatio) return;

  const c = state.crop;
  const ratio = state.aspectRatio;
  const cw = Math.min(c.w, 100 - c.x);
  const ch = cw / ratio;

  if (c.y + ch <= 100) {
    state.crop.h = ch;
    state.crop.w = cw;
  } else {
    const ch2 = 100 - c.y;
    state.crop.h = ch2;
    state.crop.w = ch2 * ratio;
    if (state.crop.x + state.crop.w > 100) {
      state.crop.w = 100 - state.crop.x;
      state.crop.h = state.crop.w / ratio;
    }
  }

  updateCropBox();
}

function constrainAspect(c, handle) {
  if (!state.aspectLocked || !state.aspectRatio) return c;
  if (handle === 'move') return c;

  const ratio = state.aspectRatio;
  let nc = { ...c };

  switch (handle) {
    case 'se':
    case 'ne':
    case 'sw':
    case 'nw':
    case 'e':
    case 'w':
      nc.h = nc.w / ratio;
      if (handle === 'nw' || handle === 'ne') {
        nc.y = state.cropStart.y + state.cropStart.h - nc.h;
      }
      break;
    case 'n':
    case 's':
      nc.w = nc.h * ratio;
      break;
  }

  nc.x = clamp(nc.x, 0, 100 - nc.w);
  nc.y = clamp(nc.y, 0, 100 - nc.h);
  nc.w = clamp(nc.w, 5, 100 - nc.x);
  nc.h = clamp(nc.h, 5, 100 - nc.y);

  return nc;
}

/* ── Rotation ── */

function initRotationControls() {
  dom.rotateCw.addEventListener('click', () => {
    state.rotation = (state.rotation + 90) % 360;
    updateRotationBadge();
  });
  dom.rotateCcw.addEventListener('click', () => {
    state.rotation = (state.rotation - 90 + 360) % 360;
    updateRotationBadge();
  });
  dom.flipH.addEventListener('click', () => {
    state.hflip = !state.hflip;
    dom.flipH.classList.toggle('active');
  });
  dom.flipV.addEventListener('click', () => {
    state.vflip = !state.vflip;
    dom.flipV.classList.toggle('active');
  });
}

function updateRotationBadge() {
  const r = state.rotation;
  const parts = [];
  if (r > 0) parts.push(`${r}°`);
  if (state.hflip) parts.push('⇔');
  if (state.vflip) parts.push('⇕');
  dom.rotationBadge.textContent = parts.join(' ') || '0°';
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
}

dom.cropX.addEventListener('input', updateCropFromInputs);
dom.cropY.addEventListener('input', updateCropFromInputs);
dom.cropW.addEventListener('input', updateCropFromInputs);
dom.cropH.addEventListener('input', updateCropFromInputs);

dom.resetCrop.addEventListener('click', () => {
  state.crop = { x: 15, y: 10, w: 70, h: 80 };
  dom.aspectBtns.forEach((b) => {
    b.classList.toggle('active', b.dataset.ratio === '');
  });
  state.aspectLocked = false;
  state.aspectRatio = null;
  updateCropBox();
});

/* ── Trim Controls ── */

function initTrimControls() {
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

/* ── Preview ── */

function updatePreview() {
  const video = dom.video;
  const canvas = dom.previewCanvas;
  const ctx = canvas.getContext('2d');

  if (!state.videoFile || !video.videoWidth) {
    canvas.width = 0;
    canvas.height = 0;
    dom.previewDim.textContent = '—';
    return;
  }

  const cp = getCropPixels();

  const maxPvw = dom.previewCanvas.parentElement.clientWidth - 0;

  let pvw, pvh;
  if (cp.w >= cp.h) {
    pvw = Math.min(cp.w, maxPvw);
    pvh = (pvw / cp.w) * cp.h;
  } else {
    pvh = Math.min(cp.h, 180);
    pvw = (pvh / cp.h) * cp.w;
  }

  canvas.width = cp.w;
  canvas.height = cp.h;
  canvas.style.width = `${pvw}px`;
  canvas.style.height = `${pvh}px`;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, cp.x, cp.y, cp.w, cp.h, 0, 0, cp.w, cp.h);

  dom.previewDim.textContent = `${cp.w} × ${cp.h}`;
}

dom.video.addEventListener('timeupdate', () => {
  if (!state.videoFile) return;
  if (previewAnimId) cancelAnimationFrame(previewAnimId);
  previewAnimId = requestAnimationFrame(updatePreview);
});

dom.video.addEventListener('seeked', updatePreview);
dom.video.addEventListener('loadeddata', updatePreview);

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

    const filterParts = [];
    const cp = getCropPixels();

    if (cp.w < state.videoWidth || cp.h < state.videoHeight || cp.x > 0 || cp.y > 0) {
      filterParts.push(`crop=${cp.w}:${cp.h}:${cp.x}:${cp.y}`);
    }

    if (state.hflip) filterParts.push('hflip');
    if (state.vflip) filterParts.push('vflip');
    if (state.rotation === 90) filterParts.push('transpose=1');
    else if (state.rotation === 180) filterParts.push('hflip,vflip');
    else if (state.rotation === 270) filterParts.push('transpose=2');

    if (format === 'gif') {
      filterParts.push('fps=10');
      const s = Math.min(cp.w || state.videoWidth, 480);
      filterParts.push(`scale=${s}:-1:flags=lanczos`);
      filterParts.push('split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse');
    }

    if (filterParts.length > 0) {
      args.push('-vf', filterParts.join(','));
    }

    const tStart = (state.trim.start / 100) * state.duration;
    const tEnd = (state.trim.end / 100) * state.duration;
    if (tStart > 0) args.push('-ss', tStart.toFixed(2));
    if (tEnd < state.duration) args.push('-to', tEnd.toFixed(2));

    if (format === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-b:v', '1M', '-c:a', 'libopus');
    } else if (format === 'gif') {
    } else {
      args.push('-preset', 'fast', '-c:a', 'aac');
    }

    args.push(outName);

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
    setTimeout(() => { dom.progressSection.hidden = true; }, 2000);
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
  state.ffmpeg = createFFmpeg({
    log: true,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
  });

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
