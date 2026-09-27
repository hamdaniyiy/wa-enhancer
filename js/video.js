/* ============================================================
   VIDEO MODULE — FFmpeg.wasm pipeline + 6 resolution presets
   ============================================================ */

console.log('[video.js] loaded');

// ── Elements ──
const videoInput      = document.getElementById('videoInput');
const videoDrop       = document.getElementById('videoDrop');
const videoPreview    = document.getElementById('videoPreview');
const videoEmpty      = document.getElementById('videoEmpty');
const videoFileInfo   = document.getElementById('videoFileInfo');
const videoAddBtn     = document.getElementById('videoAddBtn');
const videoAutoBtn    = document.getElementById('btnVideoAuto');
const progressWrap    = document.getElementById('videoProgressWrap');
const progressFill    = document.getElementById('videoProgressFill');
const progressLabel   = document.getElementById('videoProgressLabel');
const previewToggle   = document.getElementById('btnPreviewToggle');
const processBtn      = document.getElementById('btnProcessVideo');

let videoFile = null;
let videoDuration = 0;
let videoW = 0, videoH = 0;
let ffmpeg = null;
let previewFilterOn = true;
let selectedRes = { width: 1920, height: 1080 };
const vParams = { brightness: 100, contrast: 100, saturation: 100, gamma: 1.0, bitrate: 2.5 };

// ═══════════════════════════════════════════════════════════════
//   UPLOAD
// ═══════════════════════════════════════════════════════════════

function pickFile() {
  videoInput.click();
}

videoAddBtn.addEventListener('click', pickFile);
videoDrop.addEventListener('click', pickFile);

videoDrop.addEventListener('dragover', e => {
  e.preventDefault();
  videoDrop.classList.add('dragover');
});
videoDrop.addEventListener('dragleave', () => videoDrop.classList.remove('dragover'));
videoDrop.addEventListener('drop', e => {
  e.preventDefault();
  videoDrop.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f) loadVideo(f);
});
videoInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) loadVideo(f);
  // reset input supaya bisa upload file yang sama dua kali
  e.target.value = '';
});

function loadVideo(file) {
  console.log('[video] loading', file.name, file.size);

  if (!file.type.startsWith('video/')) {
    alert('File bukan video. Pilih MP4/MOV/WEBM.');
    return;
  }
  if (file.size > 200 * 1024 * 1024) {
    alert('Max 200MB');
    return;
  }

  videoFile = file;

  // Setup video element
  const url = URL.createObjectURL(file);
  videoPreview.src = url;
  videoPreview.hidden = false;
  videoEmpty.hidden = true;

  // Pasang listener SEBELUM load()
  videoPreview.onloadedmetadata = () => {
    videoDuration = videoPreview.duration;
    videoW = videoPreview.videoWidth;
    videoH = videoPreview.videoHeight;
    console.log('[video] metadata', videoW, 'x', videoH, '@', videoDuration);

    document.getElementById('vFileName').textContent = file.name;
    document.getElementById('vFileSize').textContent = fmt.bytes(file.size);
    document.getElementById('vFileRes').textContent  = `${videoW} × ${videoH}`;
    document.getElementById('vFileDur').textContent  = fmt.duration(videoDuration);
    videoFileInfo.hidden = false;

    progressWrap.hidden = false;
    progressLabel.textContent = 'Ready';
    progressFill.style.width = '0%';

    // Enable process button
    if (processBtn) processBtn.disabled = false;

    updateEstimate();
  };

  videoPreview.onerror = () => {
    alert('Gagal memuat video. Coba format MP4.');
    console.error('[video] load error');
  };

  videoPreview.load();
}

// ═══════════════════════════════════════════════════════════════
//   RESOLUTION BUTTONS
// ═══════════════════════════════════════════════════════════════

document.querySelectorAll('.res-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRes = {
      width: parseInt(btn.dataset.res, 10),
      height: parseInt(btn.dataset.height, 10)
    };
    console.log('[video] resolution →', selectedRes);
    updateEstimate();
  });
});

// ═══════════════════════════════════════════════════════════════
//   SLIDERS
// ═══════════════════════════════════════════════════════════════

function bindSlider(sliderId, labelId, onChange) {
  const s = document.getElementById(sliderId);
  const l = document.getElementById(labelId);
  if (!s || !l) return;
  s.addEventListener('input', () => {
    onChange(parseFloat(s.value), s, l);
    updateVideoPreviewFilter();
    updateEstimate();
  });
}

bindSlider('v-s-brightness', 'v-v-brightness', (v, s, l) => {
  vParams.brightness = v;
  l.textContent = v + '%';
});
bindSlider('v-s-contrast', 'v-v-contrast', (v, s, l) => {
  vParams.contrast = v;
  l.textContent = v + '%';
});
bindSlider('v-s-saturation', 'v-v-saturation', (v, s, l) => {
  vParams.saturation = v;
  l.textContent = v + '%';
});
bindSlider('v-s-gamma', 'v-v-gamma', (v, s, l) => {
  vParams.gamma = v / 100;
  l.textContent = (v / 100).toFixed(2);
});
bindSlider('v-s-bitrate', 'v-v-bitrate', (v, s, l) => {
  vParams.bitrate = v / 10;
  l.textContent = (v / 10).toFixed(1) + ' Mbps';
});
bindSlider('v-s-crf', 'v-v-crf', (v) => {
  // handled in updateEstimate
});

// Rate control switch
const rcSelect = document.getElementById('v-rc');
if (rcSelect) {
  rcSelect.addEventListener('change', () => {
    const isCrf = rcSelect.value === 'crf';
    const crfRow = document.getElementById('crfRow');
    if (crfRow) crfRow.style.display = isCrf ? '' : 'none';
    updateEstimate();
  });
}

// Other selects trigger estimate
['v-fit', 'v-codec', 'v-preset', 'v-fps', 'v-audio'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', updateEstimate);
});

// ═══════════════════════════════════════════════════════════════
//   PREVIEW FILTER
// ═══════════════════════════════════════════════════════════════

previewToggle.addEventListener('click', () => {
  previewFilterOn = !previewFilterOn;
  previewToggle.textContent = `Filter: ${previewFilterOn ? 'On' : 'Off'}`;
  previewToggle.classList.toggle('active', previewFilterOn);
  updateVideoPreviewFilter();
});

function updateVideoPreviewFilter() {
  if (!videoPreview) return;
  if (!previewFilterOn) { videoPreview.style.filter = 'none'; return; }
  const b = vParams.brightness / 100;
  const c = vParams.contrast / 100;
  const s = vParams.saturation / 100;
  const g = vParams.gamma;
  videoPreview.style.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
}

// ═══════════════════════════════════════════════════════════════
//   AUTO PRESET
// ═══════════════════════════════════════════════════════════════

videoAutoBtn.addEventListener('click', () => {
  const presets = {
    'v-s-brightness': 105,
    'v-s-contrast': 112,
    'v-s-saturation': 115,
    'v-s-gamma': 100
  };
  Object.entries(presets).forEach(([id, v]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input'));
  });
});

// ═══════════════════════════════════════════════════════════════
//   ESTIMATE
// ═══════════════════════════════════════════════════════════════

function updateEstimate() {
  if (!videoDuration) return;

  const rcMode = document.getElementById('v-rc').value;
  const audio  = document.getElementById('v-audio').value;
  const crfSlider = document.getElementById('v-s-crf');

  let videoBitrateMbps;
  if (rcMode === 'crf') {
    const crf = parseFloat(crfSlider.value);
    const base = (selectedRes.width * selectedRes.height) / (1920 * 1080);
    videoBitrateMbps = base * (30 - crf * 0.5) * 0.8;
    if (videoBitrateMbps < 0.5) videoBitrateMbps = 0.5;
  } else {
    videoBitrateMbps = vParams.bitrate;
  }

  const audioKbps = audio === 'aac' ? 128 : audio === 'aac-96' ? 96 : 0;
  const totalMbps = videoBitrateMbps + audioKbps / 1000;
  const sizeMB = (totalMbps * videoDuration) / 8;

  document.getElementById('estDur').textContent = fmt.duration(videoDuration);
  document.getElementById('estSize').textContent = sizeMB.toFixed(1) + ' MB';

  const status = document.getElementById('estStatus');
  const row = status.parentElement;
  row.classList.remove('warn', 'ok', 'bad');

  if (sizeMB <= 16) { status.textContent = 'Within WA limit'; row.classList.add('ok'); }
  else if (sizeMB <= 64) { status.textContent = 'Over WA doc limit'; row.classList.add('warn'); }
  else { status.textContent = 'Too large'; row.classList.add('bad'); }
}

// ═══════════════════════════════════════════════════════════════
//   FFMPEG
// ═══════════════════════════════════════════════════════════════

async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;

  if (typeof FFmpegWASM === 'undefined') {
    throw new Error('FFmpeg library tidak ter-load. Refresh halaman.');
  }

  progressLabel.textContent = 'Loading FFmpeg...';
  progressFill.style.width = '0%';

  const { FFmpeg } = FFmpegWASM;
  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => console.log('[ffmpeg]', message));
  ffmpeg.on('progress', ({ progress }) => {
    const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
    progressFill.style.width = pct + '%';
    progressLabel.textContent = pct + '%';
  });

  await ffmpeg.load({
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm'
  });

  console.log('[video] FFmpeg loaded');
  return ffmpeg;
}

// ═══════════════════════════════════════════════════════════════
//   BUILD FILTER
// ═══════════════════════════════════════════════════════════════

function buildFilterChain() {
  const b = (vParams.brightness - 100) / 100;
  const c = vParams.contrast / 100;
  const s = vParams.saturation / 100;
  const g = vParams.gamma;

  const eq = `eq=brightness=${b.toFixed(3)}:contrast=${c.toFixed(3)}:saturation=${s.toFixed(3)}:gamma=${g.toFixed(3)}`;

  const fit = document.getElementById('v-fit').value;
  const targetW = selectedRes.width;
  const targetH = selectedRes.height;

  let scale;
  if (fit === 'cover') {
    scale = `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`;
  } else if (fit === 'stretch') {
    scale = `scale=${targetW}:${targetH}`;
  } else {
    scale = `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease`;
  }

  const fpsVal = parseInt(document.getElementById('v-fps').value, 10);
  const fps = fpsVal > 0 ? `,fps=${fpsVal}` : '';

  return `${eq},${scale}${fps},setsar=1`;
}

// ═══════════════════════════════════════════════════════════════
//   PROCESS VIDEO
// ═══════════════════════════════════════════════════════════════

async function processVideo() {
  if (!videoFile) {
    alert('Upload video dulu.');
    return;
  }

  processBtn.disabled = true;
  const oldText = processBtn.innerHTML;
  processBtn.innerHTML = 'Processing...';
  progressFill.style.width = '0%';
  progressLabel.textContent = 'Preparing...';

  try {
    const ff = await getFFmpeg();
    const { fetchFile } = FFmpegUtil;

    progressLabel.textContent = 'Uploading to FFmpeg...';
    const inExt = videoFile.name.slice(videoFile.name.lastIndexOf('.')) || '.mp4';
    const inName = 'input' + inExt;
    await ff.writeFile(inName, await fetchFile(videoFile));

    const codec  = document.getElementById('v-codec').value;
    const preset = document.getElementById('v-preset').value;
    const rcMode = document.getElementById('v-rc').value;
    const audio  = document.getElementById('v-audio').value;

    const args = ['-i', inName, '-vf', buildFilterChain(), '-c:v', codec, '-preset', preset];

    if (rcMode === 'crf') {
      const crf = document.getElementById('v-s-crf').value;
      args.push('-crf', String(crf));
    } else {
      const br = vParams.bitrate.toFixed(2) + 'M';
      args.push('-b:v', br, '-maxrate', br, '-bufsize', (vParams.bitrate * 2).toFixed(2) + 'M');
    }

    if (audio === 'none') {
      args.push('-an');
    } else {
      const ab = audio === 'aac' ? '128k' : '96k';
      args.push('-c:a', 'aac', '-b:a', ab);
    }

    args.push('-movflags', '+faststart', '-pix_fmt', 'yuv420p', 'output.mp4');

    console.log('[video] ffmpeg args:', args.join(' '));

    progressLabel.textContent = 'Encoding...';
    await ff.exec(args);

    progressLabel.textContent = 'Saving...';
    const data = await ff.readFile('output.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    document.getElementById('vOutSize').textContent = fmt.bytes(blob.size);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enhanced_${fmt.timestamp()}.mp4`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    progressLabel.textContent = 'Done';
    progressFill.style.width = '100%';
  } catch (err) {
    console.error('[video] error:', err);
    progressLabel.textContent = 'Error — cek console';
    alert('Error: ' + err.message);
  } finally {
    processBtn.disabled = false;
    processBtn.innerHTML = oldText;
  }
}

if (processBtn) {
  processBtn.addEventListener('click', processVideo);
}

// ═══════════════════════════════════════════════════════════════
//   EXPORT BUTTON (topbar) — hanya untuk photo
// ═══════════════════════════════════════════════════════════════
// Jangan pasang listener di #btnExport dari sini — sudah di photo.js