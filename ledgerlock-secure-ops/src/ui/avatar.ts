/**
 * Local, self-contained avatar generator: no network, no third-party service and no real people.
 * It draws a friendly synthetic face from a random seed string (never a name, email or employee ID).
 * If anything goes wrong it falls back to a monogram badge.
 */
const SKIN = ['#F2D3B8', '#E3B891', '#C98D63', '#A56A47', '#7B4B32', '#5A3626'];
const HAIR = ['#2B2118', '#4A3426', '#7A4B2A', '#B07A3A', '#D8B25C', '#8A8F98', '#3B2A5C', '#1E5B6B'];
const BG = ['#1F3B63', '#2B4F7C', '#3F3A73', '#2C5E57', '#5C3B52', '#4B4B2C', '#294B5E', '#503A2B'];
const CLOTH = ['#37D7D0', '#69A9FF', '#9DE3B1', '#A88BFF', '#8C9DFF', '#FFC45E', '#FF7183', '#F3F6FA'];

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}
const pick = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function monogram(label: string, size = 96): string {
  const t = (label.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2) || '?').toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}" role="img" aria-label="Avatar"><rect width="96" height="96" rx="18" fill="#2B4F7C"/><text x="48" y="60" text-anchor="middle" font-family="system-ui,sans-serif" font-size="38" font-weight="800" fill="#F3F6FA">${esc(t)}</text></svg>`;
}

/** Deterministic avatar SVG for a seed. */
export function avatarSvg(seed: string, label = '', size = 96): string {
  try {
    if (!seed) return monogram(label, size);
    const r = rng(seed), skin = pick(r, SKIN), hair = pick(r, HAIR), bg = pick(r, BG), cloth = pick(r, CLOTH);
    const hairStyle = Math.floor(r() * 6), glasses = r() < 0.4 ? (r() < 0.5 ? 'round' : 'square') : '', mood = r() < 0.5 ? 'smile' : 'calm', brow = r() < 0.5;
    const eyeY = 47, hairBack = hairStyle === 1 || hairStyle === 3 ? `<path d="M26 52 Q26 20 48 20 Q70 20 70 52 L70 74 Q58 70 48 72 Q38 70 26 74 Z" fill="${hair}"/>` : '';
    const hairFront = [
      `<path d="M28 44 Q28 24 48 24 Q68 24 68 44 Q58 34 48 36 Q38 34 28 44 Z" fill="${hair}"/>`,
      `<path d="M28 46 Q26 22 48 22 Q70 22 68 46 Q60 32 48 34 Q36 32 28 46 Z" fill="${hair}"/>`,
      `<circle cx="48" cy="22" r="9" fill="${hair}"/><path d="M28 44 Q28 26 48 27 Q68 26 68 44 Q58 36 48 37 Q38 36 28 44 Z" fill="${hair}"/>`,
      `<path d="M27 46 Q26 22 48 22 Q70 22 69 46 Q56 30 40 34 Q32 36 27 46 Z" fill="${hair}"/>`,
      '',
      `<path d="M28 42 Q30 24 48 24 Q66 24 68 42 Q60 30 52 30 Q40 30 28 42 Z" fill="${hair}"/><circle cx="32" cy="34" r="6" fill="${hair}"/><circle cx="64" cy="34" r="6" fill="${hair}"/><circle cx="48" cy="26" r="7" fill="${hair}"/>`,
    ][hairStyle];
    const gl = glasses === 'round' ? `<circle cx="40" cy="${eyeY}" r="7" fill="none" stroke="#0B1424" stroke-width="2"/><circle cx="56" cy="${eyeY}" r="7" fill="none" stroke="#0B1424" stroke-width="2"/><path d="M47 ${eyeY} h2" stroke="#0B1424" stroke-width="2"/>`
      : glasses === 'square' ? `<rect x="33" y="${eyeY - 6}" width="14" height="12" rx="2" fill="none" stroke="#0B1424" stroke-width="2"/><rect x="49" y="${eyeY - 6}" width="14" height="12" rx="2" fill="none" stroke="#0B1424" stroke-width="2"/><path d="M47 ${eyeY} h2" stroke="#0B1424" stroke-width="2"/>` : '';
    const mouth = mood === 'smile' ? '<path d="M41 60 Q48 67 55 60" fill="none" stroke="#0B1424" stroke-width="2.4" stroke-linecap="round"/>' : '<path d="M42 62 H54" stroke="#0B1424" stroke-width="2.4" stroke-linecap="round"/>';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}" role="img" aria-label="Generated avatar${label ? ' for ' + esc(label) : ''}"><defs><clipPath id="av${seed}"><rect width="96" height="96" rx="18"/></clipPath></defs>
      <g clip-path="url(#av${seed})"><rect width="96" height="96" fill="${bg}"/><circle cx="76" cy="18" r="22" fill="#ffffff" opacity=".07"/>
      <path d="M10 100 Q14 76 48 74 Q82 76 86 100 Z" fill="${cloth}"/><path d="M40 74 L48 84 L56 74 Z" fill="${skin}"/>
      ${hairBack}<rect x="42" y="64" width="12" height="12" rx="4" fill="${skin}"/><ellipse cx="48" cy="48" rx="19" ry="22" fill="${skin}"/>${hairFront}
      <circle cx="40" cy="${eyeY}" r="2.6" fill="#0B1424"/><circle cx="56" cy="${eyeY}" r="2.6" fill="#0B1424"/>${brow ? `<path d="M35 ${eyeY - 8} h10 M51 ${eyeY - 8} h10" stroke="${hair}" stroke-width="2.4" stroke-linecap="round"/>` : ''}${gl}${mouth}</g></svg>`;
  } catch { return monogram(label, size); }
}
