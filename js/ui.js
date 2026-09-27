/* ============================================================
   UI MODULE — navigation, view switching, helpers
   ============================================================ */

// ── View Switching ──
const viewMeta = {
  photo: { title: 'Photo Pipeline', sub: 'Enhance & optimize for WhatsApp' },
  video: { title: 'Video Pipeline', sub: 'Transcode & filter — up to 4K' },
  batch: { title: 'Batch Processing', sub: 'Apply current photo params to many files' }
};

function switchView(view) {
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('active', v.id === `view-${view}`));

  const meta = viewMeta[view];
  document.getElementById('viewTitle').textContent = meta.title;
  document.getElementById('viewSub').textContent = meta.sub;

  // Topbar actions only relevant for photo view
  const resetBtn  = document.getElementById('btnReset');
  const exportBtn = document.getElementById('btnExport');
  if (resetBtn)  resetBtn.style.display  = view === 'photo' ? '' : 'none';
  if (exportBtn) exportBtn.style.display = view === 'photo' ? '' : 'none';
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ── Utilities ──
const fmt = {
  bytes(n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  },
  duration(sec) {
    if (!sec && sec !== 0) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  },
  timestamp() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  }
};

window.fmt = fmt;