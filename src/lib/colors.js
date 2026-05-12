// Gera gradiente consistente a partir de uma string (para avatares fallback v3).
const GRADIENTS = [
  'linear-gradient(135deg, #818cf8, #6366f1)',  // indigo
  'linear-gradient(135deg, #5eead4, #0d9488)',  // teal
  'linear-gradient(135deg, #fb7185, #e11d48)',  // rose
  'linear-gradient(135deg, #6ee7b7, #059669)',  // emerald
  'linear-gradient(135deg, #c4b5fd, #7c3aed)',  // violet
  'linear-gradient(135deg, #7dd3fc, #0284c7)',  // sky
  'linear-gradient(135deg, #fcd34d, #d97706)',  // amber
  'linear-gradient(135deg, #f9a8d4, #be185d)',  // pink
];

const SOLIDS = [
  '#6366f1', '#0d9488', '#e11d48', '#059669',
  '#7c3aed', '#0284c7', '#d97706', '#be185d',
];

function hash(s) {
  if (!s) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function colorFromString(s) {
  return SOLIDS[hash(s) % SOLIDS.length];
}

export function gradientFromString(s) {
  return GRADIENTS[hash(s) % GRADIENTS.length];
}
