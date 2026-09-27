/* ============================================================
   PHOTO MODULE — enhancement pipeline + split view + histogram
   ============================================================ */

// ── Elements ──
const photoInput       = document.getElementById('photoInput');
const photoDrop        = document.getElementById('photoDrop');
const photoStage       = document.getElementById('photoStage');
const photoEmpty       = document.getElementById('photoEmpty');
const photoFileInfo    = document.getElementById('photoFileInfo');
const canvasOriginal   = document.getElementById('canvasOriginal');
const canvasResult     = document.getElementById('canvasResult');
const ctxO             = canvasOriginal.getContext('2d', { willReadFrequently: true });
const ctxR             = canvasResult.getContext('2d', { willReadFrequently: true });
const histogramCanvas  = document.getElementById('histogram');
const histogramWrap    = document.getElementById('photoHistogram');
const splitHandle      = document.getElementById('splitHandle');
const btnAdd           = document.getElementById('photoAddBtn');
const btnAuto          = document.getElementById('btnAuto');
const btnReset         = document.getElementById('btnReset');
const btnExport        = document.getElementById('btnExport');

let originalImage = null;
let photoMode = 'split'; // split | result | original
let splitPercent = 0.5;

// ── Param registry ──
const params = {
  brightness: 0, contrast: 0, exposure: 0, highlights: 0, shadows: 0,
  saturation: 0, warmth: 0, vibrance: 0,
  sharpness: 0, denoise: 0, clarity: 0
};

// Bind sliders
Object.keys(params).forEach(key => {
  const slider = document.getElementById(`s-${key}`);
  const label  = document.getElementById(`v-${key}`);
  if (!slider) return;
  slider.addEventListener('input', () => {
    params[key] = +slider.value;
    label.textContent = slider.value;
    scheduleRender();
  });
});

// Quality slider (not part of params — export only)
const qualitySlider = document.getElementById('s-quality');
qualitySlider.addEventListener('input', () => {
  document.getElementById('v-quality').textContent = qualitySlider.value;
  updateOutputEstimate();
});

// Format / preset / target size
document.getElementById('p-format').addEventListener('change', updateOutputEstimate);
document.getElementById('p-preset').addEventListener('change', () => { scheduleRender(); updateOutputEstimate(); });
document.getElementById('p-targetsize').addEventListener('change', updateOutputEstimate);

// ── Upload ──
btnAdd.addEventListener('click', () => photoInput.click());
photoDrop.addEventListener('click', () => photoInput.click());
photoDrop.addEventListener('dragover', e => { e.preventDefault(); photoDrop.classList.add('dragover'); });
photoDrop.addEventListener('dragleave', () => photoDrop.classList.remove('dragover'));
photoDrop.addEventListener('drop', e => {
  e.preventDefault();
  photoDrop.classList.remove('dragover');
  if (e.dataTransfer.files[0]) loadPhoto(e.dataTransfer.files[0]);
});
photoInput.addEventListener('change', e => {
  if (e.target.files[0]) loadPhoto(e.target.files[0]);
});

async function loadPhoto(file) {
  if (file.size > 25 * 1024 * 1024) { alert('Max 25MB'); return; }

  const bitmap = await createImageBitmap(file);
  originalImage = bitmap;

  document.getElementById('pFileName').textContent = file.name;
  document.getElementById('pFileSize').textContent = fmt.bytes(file.size);
  document.getElementById('pFileDim').textContent  = `${bitmap.width} × ${bitmap.height}`;
  photoFileInfo.hidden = false;

  photoEmpty.hidden = true;
  photoStage.hidden = false;
  histogramWrap.hidden = false;

  btnReset.disabled = false;
  btnExport.disabled = false;

  scheduleRender();
}

// ── Split handle drag ──
(function setupSplit() {
  let dragging = false;
  const start = () => dragging = true;
  const end   = () => dragging = false;
  const move  = e => {
    if (!dragging) return;
    const rect = photoStage.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    splitPercent = Math.min(1, Math.max(0, x / rect.width));
    updateSplit();
  };
  splitHandle.addEventListener('mousedown', start);
  splitHandle.addEventListener('touchstart', start, { passive: true });
  window.addEventListener('mouseup', end);
  window.addEventListener('touchend', end);
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: true });
})();

function updateSplit() {
  splitHandle.style.left = (splitPercent * 100) + '%';
  if (photoMode !== 'split') return;

  const w = canvasOriginal.width;
  const clipX = splitPercent * w;
  canvasResult.style.clipPath = `inset(0 0 0 ${clipX}px)`;
}

// ── Mode chips ──
document.querySelectorAll('[data-photo-mode]').forEach(chip => {
  chip.addEventListener('click', () => {
    photoMode = chip.dataset.photoMode;
    document.querySelectorAll('[data-photo-mode]').forEach(c => c.classList.toggle('active', c === chip));

    if (photoMode === 'split') {
      canvasResult.style.clipPath = '';
      splitHandle.style.display = '';
      updateSplit();
    } else if (photoMode === 'result') {
      canvasResult.style.clipPath = 'none';
      canvasOriginal.style.visibility = 'hidden';
      splitHandle.style.display = 'none';
    } else {
      canvasResult.style.clipPath = 'inset(0 0 0 100%)';
      canvasOriginal.style.visibility = 'visible';
      splitHandle.style.display = 'none';
    }
    if (photoMode !== 'original') canvasOriginal.style.visibility = 'visible';
  });
});

// ── Rendering ──
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function render() {
  if (!originalImage) return;

  const presetMax = +document.getElementById('p-preset').value;
  const scale = presetMax === 0 ? 1 : Math.min(1, presetMax / originalImage.width);
  const outW = Math.round(originalImage.width * scale);
  const outH = Math.round(originalImage.height * scale);

  // Original layer (scaled)
  canvasOriginal.width = outW;
  canvasOriginal.height = outH;
  ctxO.drawImage(originalImage, 0, 0, outW, outH);

  // Result layer
  canvasResult.width = outW;
  canvasResult.height = outH;

  ctxR.save();
  const cssFilter = buildCssFilter();
  ctxR.filter = cssFilter;
  ctxR.drawImage(originalImage, 0, 0, outW, outH);
  ctxR.restore();
  ctxR.filter = 'none';

  // Pixel-level ops: highlights, shadows, warmth, vibrance, denoise, sharpness, clarity
  applyPixelOps(ctxR, outW, outH);

  // Histogram
  drawHistogram();

  // Split preview update
  updateSplit();
  updateOutputEstimate();
}

function buildCssFilter() {
  const b = 100 + params.brightness + params.exposure;
  const c = 100 + params.contrast;
  const s = 100 + params.saturation;
  return `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
}

function applyPixelOps(ctx, w, h) {
  const needsPixel = params.highlights || params.shadows || params.warmth ||
                     params.vibrance || params.denoise || params.sharpness || params.clarity;
  if (!needsPixel) return;

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  const hi = params.highlights / 100;
  const sh = params.shadows / 100;
  const wm = params.warmth / 100;
  const vb = params.vibrance / 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];

    // Highlights & shadows (luminance-masked)
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (hi) {
      const mask = Math.max(0, (lum - 128) / 127);
      r += hi * mask * 80;
      g += hi * mask * 80;
      b += hi * mask * 80;
    }
    if (sh) {
      const mask = Math.max(0, (128 - lum) / 128);
      r += sh * mask * 80;
      g += sh * mask * 80;
      b += sh * mask * 80;
    }

    // Warmth — shift red/blue
    if (wm) {
      r += wm * 30;
      b -= wm * 30;
    }

    // Vibrance — boost less-saturated pixels more
    if (vb) {
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = (max - min) / 255;
      const boost = (1 - sat) * vb * 60;
      if (max === r) { g -= boost * 0.3; b -= boost * 0.3; }
      else if (max === g) { r -= boost * 0.3; b -= boost * 0.3; }
      else { r -= boost * 0.3; g -= boost * 0.3; }
    }

    d[i] = Math.min(255, Math.max(0, r));
    d[i + 1] = Math.min(255, Math.max(0, g));
    d[i + 2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(img, 0, 0);

  // Denoise (simple box blur on high-frequency — approximated by mix with blur)
  if (params.denoise > 0) {
    const strength = params.denoise / 100;
    const blurred = blurCopy(ctx, w, h, 1);
    const base = ctx.getImageData(0, 0, w, h);
    const out = base.data;
    for (let i = 0; i < out.length; i += 4) {
      out[i]     = out[i]     * (1 - strength) + blurred[i]     * strength;
      out[i + 1] = out[i + 1] * (1 - strength) + blurred[i + 1] * strength;
      out[i + 2] = out[i + 2] * (1 - strength) + blurred[i + 2] * strength;
    }
    ctx.putImageData(base, 0, 0);
  }

  // Sharpness / clarity via convolution
  if (params.sharpness > 0 || params.clarity > 0) {
    const amount = Math.max(params.sharpness, params.clarity) / 100;
    convolveSharpen(ctx, w, h, amount * 0.8);
  }
}

function blurCopy(ctx, w, h, radius) {
  const src = ctx.getImageData(0, 0, w, h);
  const out = new Uint8ClampedArray(src.data.length);
  const d = src.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const px = Math.min(w - 1, Math.max(0, x + dx));
          const py = Math.min(h - 1, Math.max(0, y + dy));
          const idx = (py * w + px) * 4;
          r += d[idx]; g += d[idx + 1]; b += d[idx + 2]; n++;
        }
      }
      const oi = (y * w + x) * 4;
      out[oi] = r / n; out[oi + 1] = g / n; out[oi + 2] = b / n; out[oi + 3] = d[oi + 3];
    }
  }
  return out;
}

function convolveSharpen(ctx, w, h, amount) {
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const d = src.data, o = out.data;
  const k = amount * 0.7;
  const center = 1 + 4 * k;
  const kernel = [0, -k, 0, -k, center, -k, 0, -k, 0];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = Math.min(w - 1, Math.max(0, x + kx));
          const py = Math.min(h - 1, Math.max(0, y + ky));
          const idx = (py * w + px) * 4;
          const kv = kernel[(ky + 1) * 3 + (kx + 1)];
          r += d[idx] * kv;
          g += d[idx + 1] * kv;
          b += d[idx + 2] * kv;
        }
      }
      const oi = (y * w + x) * 4;
      o[oi] = Math.min(255, Math.max(0, r));
      o[oi + 1] = Math.min(255, Math.max(0, g));
      o[oi + 2] = Math.min(255, Math.max(0, b));
      o[oi + 3] = d[oi + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

// ── Histogram ──
function drawHistogram() {
  const w = histogramCanvas.width;
  const h = histogramCanvas.height;
  const hctx = histogramCanvas.getContext('2d');
  hctx.clearRect(0, 0, w, h);

  const { data } = ctxR.getImageData(0, 0, canvasResult.width, canvasResult.height);
  const rHist = new Uint32Array(256);
  const gHist = new Uint32Array(256);
  const bHist = new Uint32Array(256);

  const stride = Math.max(1, Math.floor(data.length / 4 / 40000)); // sample ~40k pixels
  for (let i = 0; i < data.length; i += 4 * stride) {
    rHist[data[i]]++;
    gHist[data[i + 1]]++;
    bHist[data[i + 2]]++;
  }

  const maxVal = Math.max(
    Math.max(...rHist), Math.max(...gHist), Math.max(...bHist)
  ) || 1;

  hctx.globalCompositeOperation = 'lighter';
  drawChannel(hctx, rHist, maxVal, w, h, 'rgba(224,82,82,0.7)');
  drawChannel(hctx, gHist, maxVal, w, h, 'rgba(82,224,122,0.7)');
  drawChannel(hctx, bHist, maxVal, w, h, 'rgba(82,142,224,0.7)');
}

function drawChannel(ctx, hist, max, w, h, color) {
  ctx.fillStyle = color;
  const bw = w / 256;
  for (let i = 0; i < 256; i++) {
    const bh = (hist[i] / max) * h;
    ctx.fillRect(i * bw, h - bh, bw, bh);
  }
}

// ── Estimate output size ──
async function updateOutputEstimate() {
  if (!originalImage) return;
  const q = +qualitySlider.value / 100;
  const fmtType = document.getElementById('p-format').value;
  const blob = await new Promise(res => canvasResult.toBlob(res, fmtType, q));
  if (blob) document.getElementById('pOutSize').textContent = fmt.bytes(blob.size);
}

// ── Auto enhance ──
btnAuto.addEventListener('click', () => {
  const preset = { brightness: 8, contrast: 14, exposure: 0, highlights: -12, shadows: 18,
                   saturation: 10, warmth: 4, vibrance: 20, sharpness: 35, denoise: 8, clarity: 15 };
  Object.entries(preset).forEach(([k, v]) => {
    params[k] = v;
    const s = document.getElementById(`s-${k}`);
    const l = document.getElementById(`v-${k}`);
    if (s) { s.value = v; l.textContent = v; }
  });
  scheduleRender();
});

// ── Reset ──
btnReset.addEventListener('click', () => {
  Object.keys(params).forEach(k => {
    params[k] = 0;
    const s = document.getElementById(`s-${k}`);
    const l = document.getElementById(`v-${k}`);
    if (s) { s.value = 0; l.textContent = '0'; }
  });
  scheduleRender();
});

// ── Export ──
// ── Export ──
btnExport.addEventListener('click', async () => {
  if (!originalImage) return;
  const q = +qualitySlider.value / 100;
  const fmtType = document.getElementById('p-format').value;
  const ext = fmtType === 'image/png' ? 'png' : fmtType === 'image/webp' ? 'webp' : 'jpg';
  const maxSize = +document.getElementById('p-targetsize').value;

  let blob = await new Promise(res => canvasResult.toBlob(res, fmtType, q));

  if (maxSize > 0 && blob.size > maxSize && fmtType !== 'image/png') {
    let lo = 0.3, hi = q;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      const test = await new Promise(res => canvasResult.toBlob(res, fmtType, mid));
      if (test.size <= maxSize) { blob = test; lo = mid; }
      else { hi = mid; }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `enhanced_${fmt.timestamp()}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
});