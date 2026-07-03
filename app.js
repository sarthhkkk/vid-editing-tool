const state = {
  videoFile: null, videoUrl: null,
  videoWidth: 0, videoHeight: 0, duration: 0,
  crop: { x: 15, y: 10, w: 70, h: 80 },
  trim: { start: 0, end: 100 },
  ffmpeg: null, ffmpegLoaded: false, isProcessing: false,
  dragging: null, dragStart: null, cropStart: null,
  aspectLocked: false, aspectRatio: null,
  rotation: 0, hflip: false, vflip: false,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const dom = {
  dropZone: $('#drop-zone'), fileInput: $('#file-input'),
  uploadSection: $('#upload-section'), editorSection: $('#editor-section'),
  video: $('#video-player'), videoContainer: $('#video-container'),
  cropOverlay: $('#crop-overlay'), cropBox: $('#crop-box'),
  trimStart: $('#trim-start'), trimEnd: $('#trim-end'),
  trimStartTime: $('#trim-start-time'), trimEndTime: $('#trim-end-time'),
  cropX: $('#crop-x'), cropY: $('#crop-y'), cropW: $('#crop-w'), cropH: $('#crop-h'),
  resetCrop: $('#reset-crop'),
  aspectBtns: $$('.aspect-btn'),
  rotateCw: $('#rotate-cw'), rotateCcw: $('#rotate-ccw'),
  flipH: $('#flip-h'), flipV: $('#flip-v'), rotationBadge: $('#rotation-badge'),
  previewCanvas: $('#preview-canvas'), previewDim: $('#preview-dim-label'), videoInfo: $('#video-info'),
  exportBtn: $('#export-btn'), btnText: $('#export-btn .btn-text'),
  btnLoader: $('#export-btn .btn-loader'), outputFormat: $('#output-format'),
  progressSection: $('#progress-section'), progressFill: $('#progress-fill'),
  progressText: $('#progress-text'),
};

let overlaySegments = [];
let previewAnimId = null;
let _loadCancel = false;

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getContainerDim() {
  const r = dom.videoContainer.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

/* ── Initialization (runs once per video load) ── */

let _initOnce = false;
function initOnce() {
  if (_initOnce) return;
  _initOnce = true;

  /* File upload */
  dom.dropZone.addEventListener('click', () => dom.fileInput.click());
  dom.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dom.dropZone.classList.add('drag-over'); });
  dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('drag-over'));
  dom.dropZone.addEventListener('drop', (e) => { e.preventDefault(); dom.dropZone.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f) loadVideo(f); });
  dom.fileInput.addEventListener('change', () => { if (dom.fileInput.files[0]) loadVideo(dom.fileInput.files[0]); });

  /* Crop drag */
  dom.cropBox.addEventListener('pointerdown', onCropPointerDown);
  document.addEventListener('pointermove', onCropPointerMove);
  document.addEventListener('pointerup', onCropPointerUp);
  dom.cropBox.querySelectorAll('.crop-handle').forEach((h) => {
    h.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const cls = h.className;
      state.dragging =
        cls.includes('nw') ? 'nw' : cls.includes('n') ? 'n' :
        cls.includes('ne') ? 'ne' : cls.includes('e') ? 'e' :
        cls.includes('se') ? 'se' : cls.includes('s') ? 's' :
        cls.includes('sw') ? 'sw' : cls.includes('w') ? 'w' : null;
      state.dragStart = { x: e.clientX, y: e.clientY };
      state.cropStart = { ...state.crop };
      dom.cropBox.setPointerCapture(e.pointerId);
    });
  });

  /* Trim sliders */
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

  /* Trim auto-pause at end point */
  dom.video.addEventListener('timeupdate', () => {
    if (state.duration > 0 && dom.video.currentTime >= (state.trim.end / 100) * state.duration) {
      dom.video.pause();
    }
  });

  /* Preview updates */
  dom.video.addEventListener('timeupdate', () => {
    if (!state.videoFile) return;
    if (previewAnimId) cancelAnimationFrame(previewAnimId);
    previewAnimId = requestAnimationFrame(updatePreview);
  });
  dom.video.addEventListener('seeked', updatePreview);
  dom.video.addEventListener('loadeddata', updatePreview);

  /* Crop dimension inputs */
  dom.cropX.addEventListener('input', updateCropFromInputs);
  dom.cropY.addEventListener('input', updateCropFromInputs);
  dom.cropW.addEventListener('input', updateCropFromInputs);
  dom.cropH.addEventListener('input', updateCropFromInputs);

  /* Reset crop */
  dom.resetCrop.addEventListener('click', () => {
    state.crop = { x: 15, y: 10, w: 70, h: 80 };
    dom.aspectBtns.forEach((b) => b.classList.toggle('active', b.dataset.ratio === ''));
    state.aspectLocked = false;
    state.aspectRatio = null;
    updateCropBox();
  });

  /* Aspect ratio presets */
  dom.aspectBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      dom.aspectBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.ratio;
      if (!val) { state.aspectLocked = false; state.aspectRatio = null; return; }
      const p = val.split(':');
      state.aspectRatio = parseInt(p[0]) / parseInt(p[1]);
      state.aspectLocked = true;
      snapToAspectRatio();
    });
  });

  /* Rotation */
  dom.rotateCw.addEventListener('click', () => { state.rotation = (state.rotation + 90) % 360; updateRotationBadge(); });
  dom.rotateCcw.addEventListener('click', () => { state.rotation = (state.rotation - 90 + 360) % 360; updateRotationBadge(); });
  dom.flipH.addEventListener('click', () => { state.hflip = !state.hflip; dom.flipH.classList.toggle('active'); });
  dom.flipV.addEventListener('click', () => { state.vflip = !state.vflip; dom.flipV.classList.toggle('active'); });

  /* Export */
  dom.exportBtn.addEventListener('click', exportVideo);

  /* Keyboard shortcuts */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.videoFile) {
      const cur = dom.cropOverlay.style.display;
      dom.cropOverlay.style.display = cur === 'none' ? '' : 'none';
    }
    if (e.key === ' ' && state.videoFile) {
      e.preventDefault();
      if (dom.video.paused) dom.video.play(); else dom.video.pause();
    }
  });

  /* Double-click on crop box to play/pause */
  dom.cropBox.addEventListener('dblclick', () => {
    if (!state.videoFile) return;
    if (dom.video.paused) dom.video.play(); else dom.video.pause();
  });

  /* Window resize */
  window.addEventListener('resize', () => {
    if (!state.videoFile) return;
    fitVideoContainer();
    updateCropBox();
  });
}

/* ── Video Loading ── */

function loadVideo(file) {
  console.log('[loadVideo]', file.name, file.size, file.type);
  _loadCancel = true;
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);

  state.videoFile = file;
  state.videoUrl = URL.createObjectURL(file);

  dom.uploadSection.hidden = true;
  dom.editorSection.hidden = false;
  dom.progressSection.hidden = true;
  dom.exportBtn.disabled = true;
  dom.exportBtn.textContent = 'Loading...';

  dom.cropOverlay.style.display = '';
  dom.cropBox.style.display = '';

  _loadCancel = false;

  const onMeta = () => {
    if (_loadCancel) return;
    console.log('[onMeta]', dom.video.videoWidth, 'x', dom.video.videoHeight, 'dur:', dom.video.duration);
    state.videoWidth = dom.video.videoWidth;
    state.videoHeight = dom.video.videoHeight;
    state.duration = dom.video.duration;
    if (!state.videoWidth || !state.videoHeight) {
      console.warn('[onMeta] dimensions are 0 — retrying with canplay');
      dom.video.addEventListener('canplay', () => {
        if (_loadCancel) return;
        state.videoWidth = dom.video.videoWidth || state.videoWidth;
        state.videoHeight = dom.video.videoHeight || state.videoHeight;
        fitVideoContainer();
        updateCropBox();
      }, { once: true });
      return;
    }

    dom.exportBtn.disabled = false;
    dom.exportBtn.textContent = 'Export Video';

    fitVideoContainer();
    initCropOverlay();
    initTrimControls();
    syncDimensionInputs();
    updateTrimDisplay();
    updatePreview();
    showVideoInfo();
    autoSelectAspect();
  };

  const onError = () => {
    if (_loadCancel) return;
    console.error('[loadVideo] error event', dom.video.error);
    dom.exportBtn.disabled = false;
    dom.exportBtn.textContent = 'Error loading video';
    dom.progressSection.hidden = false;
    dom.progressText.textContent = `Error: ${dom.video.error?.message || 'Unsupported or corrupted file'}`;
  };

  dom.video.addEventListener('loadedmetadata', onMeta, { once: true });
  dom.video.addEventListener('error', onError, { once: true });

  const loadTimeout = setTimeout(() => {
    if (_loadCancel) return;
    console.warn('[loadVideo] timed out after 30s');
    _loadCancel = true;
    dom.exportBtn.disabled = false;
    dom.exportBtn.textContent = 'Video load timed out';
    dom.progressSection.hidden = false;
    dom.progressText.textContent = 'Timed out. Check console (F12) for details, or try a smaller/standard MP4.';
  }, 30000);

  dom.video.addEventListener('loadedmetadata', () => clearTimeout(loadTimeout), { once: true });
  dom.video.addEventListener('error', () => clearTimeout(loadTimeout), { once: true });

  dom.video.src = state.videoUrl;
}

/* ── Layout ── */

function fitVideoContainer() {
  let maxW = dom.videoContainer.clientWidth;
  if (maxW < 1) maxW = 640;
  const aspect = state.videoWidth / state.videoHeight;
  const maxH = Math.min(480, maxW / aspect);
  let w, h;
  if (maxW / aspect > maxH) { h = maxH; w = h * aspect; }
  else { w = maxW; h = w / aspect; }
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
}

function recreateOverlaySegments() {
  overlaySegments.forEach((s) => s.remove());
  overlaySegments = [];
  for (const _ of [1, 2, 3, 4]) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;background:rgba(0,0,0,0.55);pointer-events:none;z-index:1;';
    dom.cropOverlay.appendChild(el);
    overlaySegments.push(el);
  }
}

function updateCropBox() {
  const { w, h } = getContainerDim();
  if (w < 1 || h < 1) return;
  const { x, y, w: cw, h: ch } = state.crop;
  dom.cropBox.style.cssText = `
    position:absolute; left:${(x / 100) * w}px; top:${(y / 100) * h}px;
    width:${(cw / 100) * w}px; height:${(ch / 100) * h}px;
    border:2px solid #fff; cursor:move; pointer-events:auto; z-index:2;
  `;
  syncDimensionInputs();
  updateOverlaySegments();
  updatePreview();
}

function updateOverlaySegments() {
  const { w, h } = getContainerDim();
  if (w < 1 || h < 1) return;
  const p = (v, s) => (v / 100) * s;
  const { x, y, w: cw, h: ch } = state.crop;
  const cL = p(x, w), cT = p(y, h), cR = p(x + cw, w), cB = p(y + ch, h);
  const pos = [
    { l: 0, t: 0, w: w, h: cT },
    { l: 0, t: cB, w: w, h: h - cB },
    { l: 0, t: cT, w: cL, h: ch },
    { l: cR, t: cT, w: w - cR, h: ch },
  ];
  overlaySegments.forEach((el, i) => {
    const p = pos[i];
    el.style.cssText = `position:absolute; left:${p.l}px; top:${p.t}px; width:${p.w}px; height:${p.h}px; background:rgba(0,0,0,0.55); pointer-events:none; z-index:1;`;
  });
}

function syncDimensionInputs() {
  dom.cropX.value = Math.round(state.crop.x);
  dom.cropY.value = Math.round(state.crop.y);
  dom.cropW.value = Math.round(state.crop.w);
  dom.cropH.value = Math.round(state.crop.h);
}

/* ── Crop Drag ── */

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
  if (w < 1 || h < 1) return;
  const dxP = (dx / w) * 100, dyP = (dy / h) * 100;
  let c = { ...state.cropStart };

  switch (state.dragging) {
    case 'move':
      c.x = clamp(state.cropStart.x + dxP, 0, 100 - c.w);
      c.y = clamp(state.cropStart.y + dyP, 0, 100 - c.h);
      break;
    case 'se':
      c.w = clamp(state.cropStart.w + dxP, 5, 100 - c.x);
      c.h = clamp(state.cropStart.h + dyP, 5, 100 - c.y);
      break;
    case 'nw':
      c.w = clamp(state.cropStart.w - dxP, 5, state.cropStart.x + state.cropStart.w);
      c.h = clamp(state.cropStart.h - dyP, 5, state.cropStart.y + state.cropStart.h);
      c.x = clamp(state.cropStart.x + dxP, 0, state.cropStart.x + state.cropStart.w - 5);
      c.y = clamp(state.cropStart.y + dyP, 0, state.cropStart.y + state.cropStart.h - 5);
      break;
    case 'ne':
      c.w = clamp(state.cropStart.w + dxP, 5, 100 - c.x);
      c.h = clamp(state.cropStart.h - dyP, 5, state.cropStart.y + state.cropStart.h);
      c.y = clamp(state.cropStart.y + dyP, 0, state.cropStart.y + state.cropStart.h - 5);
      break;
    case 'sw':
      c.w = clamp(state.cropStart.w - dxP, 5, state.cropStart.x + state.cropStart.w);
      c.h = clamp(state.cropStart.h + dyP, 5, 100 - c.y);
      c.x = clamp(state.cropStart.x + dxP, 0, state.cropStart.x + state.cropStart.w - 5);
      break;
    case 'n':
      c.h = clamp(state.cropStart.h - dyP, 5, state.cropStart.y + state.cropStart.h);
      c.y = clamp(state.cropStart.y + dyP, 0, state.cropStart.y + state.cropStart.h - 5);
      break;
    case 's':
      c.h = clamp(state.cropStart.h + dyP, 5, 100 - c.y);
      break;
    case 'w':
      c.w = clamp(state.cropStart.w - dxP, 5, state.cropStart.x + state.cropStart.w);
      c.x = clamp(state.cropStart.x + dxP, 0, state.cropStart.x + state.cropStart.w - 5);
      break;
    case 'e':
      c.w = clamp(state.cropStart.w + dxP, 5, 100 - c.x);
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

/* ── Aspect Ratio ── */

function snapToAspectRatio() {
  if (!state.aspectLocked || !state.aspectRatio) return;
  const { x, y, w, h } = state.crop;
  const ratio = state.aspectRatio;
  let nw = Math.min(w, 100 - x);
  let nh = nw / ratio;
  if (y + nh > 100) {
    nh = 100 - y;
    nw = nh * ratio;
    if (x + nw > 100) { nw = 100 - x; nh = nw / ratio; }
  }
  state.crop.w = nw; state.crop.h = nh;
  updateCropBox();
}

function constrainAspect(c, handle) {
  if (!state.aspectLocked || !state.aspectRatio || handle === 'move') return c;
  const r = state.aspectRatio;
  let nc = { ...c };
  if (handle === 'n' || handle === 's') { nc.w = nc.h * r; }
  else { nc.h = nc.w / r; if (handle === 'nw' || handle === 'ne') nc.y = state.cropStart.y + state.cropStart.h - nc.h; }
  nc.x = clamp(nc.x, 0, 100 - nc.w); nc.y = clamp(nc.y, 0, 100 - nc.h);
  nc.w = clamp(nc.w, 5, 100 - nc.x); nc.h = clamp(nc.h, 5, 100 - nc.y);
  return nc;
}

/* ── Rotation ── */

function updateRotationBadge() {
  const parts = [];
  if (state.rotation > 0) parts.push(`${state.rotation}°`);
  if (state.hflip) parts.push('\u21D4');
  if (state.vflip) parts.push('\u21D5');
  dom.rotationBadge.textContent = parts.join(' ') || '0\u00B0';
}

/* ── Crop Dimension Inputs ── */

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

/* ── Trim Controls ── */

function initTrimControls() {
  dom.trimStart.min = 0; dom.trimStart.max = 100; dom.trimStart.value = 0; dom.trimStart.step = 0.1;
  dom.trimEnd.min = 0; dom.trimEnd.max = 100; dom.trimEnd.value = 100; dom.trimEnd.step = 0.1;
}

function updateTrimDisplay() {
  const dur = state.duration;
  dom.trimStartTime.textContent = formatTime((state.trim.start / 100) * dur);
  dom.trimEndTime.textContent = formatTime((state.trim.end / 100) * dur);
}

/* ── Preview ── */

function updatePreview() {
  const video = dom.video;
  const canvas = dom.previewCanvas;
  if (!state.videoFile || !video.videoWidth) {
    canvas.width = 0; canvas.height = 0;
    dom.previewDim.textContent = '\u2014';
    return;
  }
  const cp = getCropPixels();
  if (cp.w < 1 || cp.h < 1) return;
  const maxPvw = dom.previewCanvas.parentElement.clientWidth || 260;
  let pvw, pvh;
  if (cp.w >= cp.h) { pvw = Math.min(cp.w, maxPvw); pvh = (pvw / cp.w) * cp.h; }
  else { pvh = Math.min(cp.h, 180); pvw = (pvh / cp.h) * cp.w; }
  canvas.width = cp.w; canvas.height = cp.h;
  canvas.style.width = `${pvw}px`; canvas.style.height = `${pvh}px`;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(video, cp.x, cp.y, cp.w, cp.h, 0, 0, cp.w, cp.h);
  dom.previewDim.textContent = `${cp.w} \u00D7 ${cp.h}`;
}

/* ── Video Info & Auto Aspect ── */

function showVideoInfo() {
  const w = state.videoWidth;
  const h = state.videoHeight;
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const g = gcd(w, h);
  const ar = `${w / g}:${h / g}`;
  const minDim = Math.min(w, h);
  let quality;
  if (minDim >= 3840) quality = '4K';
  else if (minDim >= 1920) quality = 'Full HD';
  else if (minDim >= 1280) quality = 'HD';
  else if (minDim >= 720) quality = 'SD';
  else quality = 'Low';
  dom.videoInfo.textContent = `${w} \u00D7 ${h} \u00B7 ${ar} \u00B7 ${quality}`;
}

function autoSelectAspect() {
  const ratio = state.videoWidth / state.videoHeight;
  const presets = [
    { label: '1:1', val: 1 },
    { label: '16:9', val: 16 / 9 },
    { label: '4:3', val: 4 / 3 },
    { label: '3:2', val: 3 / 2 },
    { label: '3:4', val: 3 / 4 },
    { label: '9:16', val: 9 / 16 },
  ];
  let closest = presets[0];
  let minDiff = Math.abs(ratio - closest.val);
  for (const p of presets) {
    const d = Math.abs(ratio - p.val);
    if (d < minDiff) { minDiff = d; closest = p; }
  }
  if (minDiff > 0.1) return;
  dom.aspectBtns.forEach((b) => b.classList.toggle('active', b.dataset.ratio === closest.label));
  state.aspectLocked = true;
  state.aspectRatio = closest.val;
}

/* ── Export ── */

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
    const ffmpeg = state.ffmpeg;

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

    if (filterParts.length > 0) args.push('-vf', filterParts.join(','));

    const tStart = (state.trim.start / 100) * state.duration;
    const tEnd = (state.trim.end / 100) * state.duration;
    if (tStart > 0) args.push('-ss', tStart.toFixed(2));
    if (tEnd < state.duration) args.push('-to', tEnd.toFixed(2));

    if (format === 'webm') args.push('-c:v', 'libvpx-vp9', '-b:v', '1M', '-c:a', 'libopus');
    else if (format !== 'gif') args.push('-preset', 'fast', '-c:a', 'aac');

    args.push(outName);

    dom.progressText.textContent = 'Processing video...';
    dom.progressFill.style.width = '20%';

    ffmpeg.setLogger(({ type, msg }) => {
      if (type === 'fferr') {
        const m = msg.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (m) {
          const elapsed = parseTimeToSeconds(m[1]);
          const dur = tEnd - tStart || state.duration;
          const pct = Math.min(95, 20 + (elapsed / dur) * 75);
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
  if (typeof FFmpegWASM === 'undefined') throw new Error('FFmpeg failed to load. Check your internet connection.');
  const { createFFmpeg } = FFmpegWASM;
  state.ffmpeg = createFFmpeg({ log: true, corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js' });
  dom.progressText.textContent = 'Downloading FFmpeg (~30MB first time)...';
  await state.ffmpeg.load();
  state.ffmpegLoaded = true;
}

function getCropPixels() {
  return {
    x: Math.round((state.crop.x / 100) * state.videoWidth),
    y: Math.round((state.crop.y / 100) * state.videoHeight),
    w: Math.round((state.crop.w / 100) * state.videoWidth),
    h: Math.round((state.crop.h / 100) * state.videoHeight),
  };
}

function getExt(name) { const i = name.lastIndexOf('.'); return i > -1 ? name.slice(i) : '.mp4'; }
function getMimeType(fmt) { return { mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif' }[fmt] || 'video/mp4'; }

function parseTimeToSeconds(t) {
  const p = t.split(':');
  return parseFloat(p[0]) * 3600 + parseFloat(p[1]) * 60 + parseFloat(p[2]);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* ── Boot ── */

dom.editorSection.hidden = true;
initOnce();
