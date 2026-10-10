export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}
export const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T | null;
export const $$ = (root: ParentNode, sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
export const toneIcon = (t: string) => ({ good: '✓', warn: '⚠', bad: '✕', info: 'ⓘ', clue: '⌕', alert: '❗' }[t] ?? '•');
