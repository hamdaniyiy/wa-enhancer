/* ============================================================
   BATCH MODULE — apply current photo params to multiple files
   ============================================================ */

const batchInput = document.getElementById('batchInput');
const batchDrop  = document.getElementById('batchDrop');
const batchList  = document.getElementById('batchList');
const batchActions = document.getElementById('batchActions');
const batchAddBtn = document.getElementById('batchAddBtn');
const batchRunBtn = document.getElementById('batchRun');
const batchClearBtn = document.getElementById('batchClear');

let batchFiles = [];

batchAddBtn.addEventListener('click', () => batchInput.click());
batchDrop.addEventListener('click', () => batchInput.click());
batchDrop.addEventListener('dragover', e => { e.preventDefault(); batchDrop.classList.add('dragover'); });
batchDrop.addEventListener('dragleave', () => batchDrop.classList.remove('dragover'));
batchDrop.addEventListener('drop', e => {
  e.preventDefault();
  batchDrop.classList.remove('dragover');
  addBatchFiles([...e.dataTransfer.files]);
});
batchInput.addEventListener('change', e => addBatchFiles([...e.target.files]));

function addBatchFiles(files) {
  const valid = files.filter(f => f.type.startsWith('image/'));
  valid.forEach(f => batchFiles.push({ file: f, status: 'pending' }));
  renderBatchList();
}

function renderBatchList() {
  batchList.innerHTML = '';
  batchFiles.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'batch-item' + (item.status === 'done' ? ' done' : item.status === 'error' ? ' error' : '');
    row.innerHTML = `
      <span class="bi-name truncate">${item.file.name}</span>
      <span class="bi-size">${fmt.bytes(item.file.size)}</span>
      <span class="bi-status">${item.status}</span>
    `;
    batchList.appendChild(row);
  });
  batchActions.hidden = batchFiles.length === 0;
}

batchClearBtn.addEventListener('click', () => {
  batchFiles = [];
  renderBatchList();
});

batchRunBtn.addEventListener('click', async () => {
  batchRunBtn.disabled = true;
  for (let i = 0; i < batchFiles.length; i++) {
    const item = batchFiles[i];
    if (item.status === 'done') continue;
    try {
      item.status = 'processing'; renderBatchList();
      const blob = await processOnePhoto(item.file);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enhanced_${item.file.name.replace(/\.[^.]+$/, '')}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 500);
      item.status = 'done';
    } catch (e) {
      console.error(e);
      item.status = 'error';
    }
    renderBatchList();
    await new Promise(r => setTimeout(r, 200));
  }
  batchRunBtn.disabled = false;
});

async function processOnePhoto(file) {
  const bitmap = await createImageBitmap(file);
  const maxW = +document.getElementById('p-preset').value;
  const scale = maxW === 0 ? 1 : Math.min(1, maxW / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });

  // Reuse global params from photo.js
  const filter = `brightness(${100 + params.brightness + params.exposure}%) contrast(${100 + params.contrast}%) saturate(${100 + params.saturation}%)`;
  cx.filter = filter;
  cx.drawImage(bitmap, 0, 0, w, h);
  cx.filter = 'none';

  // Sharpness
  if (params.sharpness > 0) {
    convolveSharpen(cx, w, h, params.sharpness / 100 * 0.8);
  }

  const q = +document.getElementById('s-quality').value / 100;
  const fmtType = document.getElementById('p-format').value;
  return await new Promise(res => c.toBlob(res, fmtType, q));
}