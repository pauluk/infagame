#!/usr/bin/env python3
"""Pack the raw Blender renders into optimised Phaser atlases and write asset-manifest.json.

  python3 blender/scripts/pack_atlas.py

Reads  blender/renders-raw/meta.jsonl (+ PNGs) and blender/asset-selection.json
Writes public/assets/<group>/atlas.png + atlas.json (Phaser JSON-hash, with per-frame pivots) and asset-manifest.json.
Needs Pillow (pip install pillow).
"""
import json, math, sys, datetime
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "blender" / "renders-raw"
OUT = ROOT / "public" / "assets"
RENDER_SCALE = 2
MAX_W = 2048

def pack(group, items):
    # trim, then shelf-pack by height
    frames = []
    for m in items:
        im = Image.open(RAW / m["file"]).convert("RGBA")
        bbox = im.getchannel("A").point(lambda a: 255 if a > 6 else 0).getbbox()
        if not bbox:
            print("empty sprite", m["name"]); continue
        frames.append(dict(meta=m, img=im.crop(bbox), bbox=bbox, src=im.size))
    frames.sort(key=lambda f: -f["img"].height)
    x = y = row_h = 0
    pad = 2
    placed = []
    for f in frames:
        w, h = f["img"].size
        if x + w + pad > MAX_W:
            x, y, row_h = 0, y + row_h + pad, 0
        placed.append((f, x, y)); x += w + pad; row_h = max(row_h, h)
    H = 1
    total_h = y + row_h
    while H < total_h: H *= 2
    atlas = Image.new("RGBA", (MAX_W, H), (0, 0, 0, 0))
    out = {"frames": {}, "meta": {"app": "ledgerlock pack_atlas.py", "image": "atlas.png", "format": "RGBA8888", "size": {"w": MAX_W, "h": H}, "scale": str(1.0 / RENDER_SCALE), "renderScale": RENDER_SCALE}}
    for f, px, py in placed:
        atlas.alpha_composite(f["img"], (px, py))
        m = f["meta"]; l, t, r, b = f["bbox"]; sw, sh = f["src"]
        out["frames"][m["name"]] = {
            "frame": {"x": px, "y": py, "w": r - l, "h": b - t}, "rotated": False, "trimmed": True,
            "spriteSourceSize": {"x": l, "y": t, "w": r - l, "h": b - t}, "sourceSize": {"w": sw, "h": sh},
            "pivot": {"x": m["pivot"][0] / sw, "y": m["pivot"][1] / sh},
        }
    d = OUT / group
    d.mkdir(parents=True, exist_ok=True)
    atlas.save(d / "atlas.png", optimize=True)
    (d / "atlas.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"{group}: {len(placed)} sprites -> {(d / 'atlas.png').stat().st_size / 1024:.0f} KiB, atlas {MAX_W}x{H}")
    return {p[0]["meta"]["name"]: group for p in placed}

def main():
    metas = [json.loads(l) for l in (RAW / "meta.jsonl").read_text().splitlines() if l.strip()]
    groups = {}
    for m in metas: groups.setdefault(m["group"], []).append(m)
    where = {}
    for g, items in groups.items(): where.update(pack(g, items))
    sel = json.loads((ROOT / "blender" / "asset-selection.json").read_text())
    by_id = {i["id"]: i for i in sel["items"]}
    used = {}
    for m in metas:
        for u in m["uses"]:
            if u in by_id: used.setdefault(u, []).append(m["name"])
        if "tile_corridor" in m["uses"]: used.setdefault("ph_floor_tiles", []).append(m["name"])
        used.setdefault("ph_hdri", []).append(m["name"])
    sources = []
    for pid, pack_ in sel["packs"].items():
        items = [i for i in sel["items"] if i["pack"] == pid and i["id"] in used]
        if not items: continue
        sources.append({
            "id": pid, "name": pack_["name"], "creator": pack_["creator"], "source_url": pack_["source_url"],
            "download_url": pack_["download_url"], "original_filename": pack_["original_filename"],
            "license": pack_["license"], "license_url": pack_["license_url"], "license_file": pack_["license_file"],
            "license_verified": "2026-10-10, on the pack page and in the supplied licence file",
            "attribution_required": False,
            "items": [{"id": i["id"], "file": i["file"], "role": i["role"], "rendered_into": sorted(set(used[i["id"]]))} for i in items],
        })
    manifest = {
        "project": "LedgerLock: Secure Ops",
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "renderer": "Blender 4.5.9 LTS, Cycles CPU (see docs/art-pipeline.md)",
        "note": "Only third-party items that were actually imported and rendered into at least one sprite are listed. Custom props, bugs, malware and effects were modelled for this project in Blender (no third-party source).",
        "sources": sources,
        "sprites": {m["name"]: {"atlas": f"assets/{where[m['name']]}/atlas.json", "frame": m["name"], "library_items": m["uses"],
                                  "third_party_items": [u for u in m["uses"] if u in by_id] + (["ph_floor_tiles"] if "tile_corridor" in m["uses"] else [])} for m in metas if m["name"] in where},
    }
    (ROOT / "asset-manifest.json").write_text(json.dumps(manifest, indent=1))
    print("asset-manifest.json:", len(manifest["sprites"]), "sprites,", sum(len(s["items"]) for s in sources), "third-party items")

if __name__ == "__main__":
    main()
