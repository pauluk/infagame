/** Crops tool icons out of the Blender-rendered ui atlas into data URLs (so the DOM UI can show the 3D tool renders). */
export async function loadToolIcons(frames: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const base = import.meta.env.BASE_URL + 'assets/ui/';
    const [json, img] = await Promise.all([
      fetch(base + 'atlas.json').then((r) => r.json()),
      new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = base + 'atlas.png'; }),
    ]);
    for (const f of frames) {
      const fr = json.frames[f]?.frame; if (!fr) continue;
      const c = document.createElement('canvas'); c.width = 96; c.height = 96;
      const ctx = c.getContext('2d')!;
      const s = Math.min(92 / fr.w, 92 / fr.h);
      ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h, (96 - fr.w * s) / 2, (96 - fr.h * s) / 2, fr.w * s, fr.h * s);
      out[f] = c.toDataURL('image/png');
    }
  } catch { /* icons are optional: the UI falls back to glyphs */ }
  return out;
}
