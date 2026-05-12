/* ═══════════════════════════════════════════════════════════════════
   Design System • _assets.js
   Helpers para fontes externas de imagens (avatares, fotos, mídia)
   + comportamento do custom select (.cselect)
   ═══════════════════════════════════════════════════════════════════ */

/* AVATARES — pravatar.cc gera fotos consistentes pelo seed
   Use: avatarUrl(seed, size)
   Lista de IDs (1..70 disponível em pravatar.cc) */
const AVATAR_IDS = {
  vini:   12, maria:  5, joao:   8, carla: 16, rafa:  15, ana:    1,
  pedro:  33, lucia: 47, bruno:  60, marcia:25, jp:     7, eu:    13,
  spam:   38, lucas: 11, fernanda:21, hugo: 55, julia: 32, paulo: 50,
  ricardo:42, sofia:  9, tiago: 23,
};
function avatarUrl(seed, size = 96) {
  const id = AVATAR_IDS[seed] || ((seed.length * 7) % 70) + 1;
  return `https://i.pravatar.cc/${size}?img=${id}`;
}

/* FOTOS / IMAGENS — picsum.photos para mockups de foto
   Use: photoUrl(seed, w, h) */
function photoUrl(seed, w = 400, h = 300) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

/* FILE PREVIEWS (SVG mock) */
const FILE_THUMBS = {
  pdf: `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <defs><linearGradient id="pdfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff5f5"/><stop offset="1" stop-color="#fed7d7"/></linearGradient></defs>
    <rect x="2" y="2" width="76" height="96" rx="6" fill="url(#pdfg)" stroke="#fc8181" stroke-width="1.5"/>
    <rect x="40" y="62" width="32" height="20" rx="3" fill="#e53e3e"/>
    <text x="56" y="76" text-anchor="middle" font-family="-apple-system,sans-serif" font-weight="800" font-size="11" fill="#fff">PDF</text>
    <line x1="12" y1="20" x2="68" y2="20" stroke="#fc8181" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="12" y1="28" x2="60" y2="28" stroke="#fc8181" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>
    <line x1="12" y1="36" x2="64" y2="36" stroke="#fc8181" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>
    <line x1="12" y1="44" x2="56" y2="44" stroke="#fc8181" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>
    <line x1="12" y1="52" x2="60" y2="52" stroke="#fc8181" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>
  </svg>`,
  doc: `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <defs><linearGradient id="docg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ebf8ff"/><stop offset="1" stop-color="#bee3f8"/></linearGradient></defs>
    <rect x="2" y="2" width="76" height="96" rx="6" fill="url(#docg)" stroke="#63b3ed" stroke-width="1.5"/>
    <rect x="40" y="62" width="32" height="20" rx="3" fill="#3182ce"/>
    <text x="56" y="76" text-anchor="middle" font-family="-apple-system,sans-serif" font-weight="800" font-size="11" fill="#fff">DOC</text>
    <line x1="12" y1="20" x2="68" y2="20" stroke="#63b3ed" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="12" y1="28" x2="60" y2="28" stroke="#63b3ed" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>
    <line x1="12" y1="36" x2="64" y2="36" stroke="#63b3ed" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>
    <line x1="12" y1="44" x2="56" y2="44" stroke="#63b3ed" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>
  </svg>`,
  xls: `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <defs><linearGradient id="xlsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0fff4"/><stop offset="1" stop-color="#c6f6d5"/></linearGradient></defs>
    <rect x="2" y="2" width="76" height="96" rx="6" fill="url(#xlsg)" stroke="#48bb78" stroke-width="1.5"/>
    <rect x="40" y="62" width="32" height="20" rx="3" fill="#38a169"/>
    <text x="56" y="76" text-anchor="middle" font-family="-apple-system,sans-serif" font-weight="800" font-size="11" fill="#fff">XLS</text>
    <g stroke="#48bb78" stroke-width="1.2" fill="none">
      <line x1="12" y1="20" x2="68" y2="20"/>
      <line x1="12" y1="30" x2="68" y2="30"/>
      <line x1="12" y1="40" x2="68" y2="40"/>
      <line x1="12" y1="50" x2="40" y2="50"/>
      <line x1="12" y1="20" x2="12" y2="50"/>
      <line x1="40" y1="20" x2="40" y2="50"/>
      <line x1="68" y1="20" x2="68" y2="40"/>
    </g>
  </svg>`,
  zip: `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <defs><linearGradient id="zipg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#feebc8"/></linearGradient></defs>
    <rect x="2" y="2" width="76" height="96" rx="6" fill="url(#zipg)" stroke="#dd6b20" stroke-width="1.5"/>
    <path d="M30 10 v8 h6 v8 h-6 v8 h6 v8 h-6 v6 a6 6 0 0 0 6 6 h12 a6 6 0 0 0 6 -6 v-26 a4 4 0 0 0 -4 -4 h-14 v-8 z" fill="#dd6b20" opacity=".25"/>
    <rect x="40" y="62" width="32" height="20" rx="3" fill="#dd6b20"/>
    <text x="56" y="76" text-anchor="middle" font-family="-apple-system,sans-serif" font-weight="800" font-size="11" fill="#fff">ZIP</text>
  </svg>`,
  fig: `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
    <defs><linearGradient id="figg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#faf5ff"/><stop offset="1" stop-color="#e9d8fd"/></linearGradient></defs>
    <rect x="2" y="2" width="76" height="96" rx="6" fill="url(#figg)" stroke="#9f7aea" stroke-width="1.5"/>
    <g transform="translate(20 18) scale(1.6)" stroke="none">
      <circle cx="6" cy="6" r="6" fill="#f24e1e"/>
      <circle cx="18" cy="6" r="6" fill="#a259ff"/>
      <circle cx="6" cy="18" r="6" fill="#1abcfe"/>
      <circle cx="6" cy="30" r="6" fill="#0acf83"/>
      <circle cx="18" cy="18" r="6" fill="#ff7262"/>
    </g>
    <rect x="40" y="78" width="32" height="14" rx="3" fill="#9f7aea"/>
    <text x="56" y="88" text-anchor="middle" font-family="-apple-system,sans-serif" font-weight="800" font-size="9" fill="#fff">FIG</text>
  </svg>`,
};
function fileThumb(kind) { return FILE_THUMBS[kind] || FILE_THUMBS.doc; }

/* ─── CUSTOM SELECT (.cselect) widget ─── */
function setupCSelect(root) {
  const trigger = root.querySelector('.cselect-trigger');
  const menu = root.querySelector('.cselect-menu');
  const valEl = trigger.querySelector('.val');
  if (!trigger || !menu) return;

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.cselect.open').forEach(o => { if (o !== root) o.classList.remove('open'); });
    root.classList.toggle('open');
  });
  menu.querySelectorAll('.cselect-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      menu.querySelectorAll('.cselect-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      valEl.textContent = opt.dataset.label || opt.textContent.trim();
      root.classList.remove('open');
      root.dispatchEvent(new CustomEvent('change', { detail: { value: opt.dataset.value, label: valEl.textContent } }));
    });
  });
}
document.addEventListener('click', () => {
  document.querySelectorAll('.cselect.open').forEach(o => o.classList.remove('open'));
});
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.cselect.open').forEach(o => o.classList.remove('open'));
});
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.cselect').forEach(setupCSelect);
});

/* Helpers globais */
window.AVATAR_IDS = AVATAR_IDS;
window.avatarUrl = avatarUrl;
window.photoUrl = photoUrl;
window.fileThumb = fileThumb;
