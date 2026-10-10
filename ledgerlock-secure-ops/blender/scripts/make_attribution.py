#!/usr/bin/env python3
"""Regenerate ATTRIBUTION.md from asset-manifest.json (run automatically by `npm run assets:render`)."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
m = json.loads((ROOT / "asset-manifest.json").read_text())
out = ["# Attribution and licences", "",
 "LedgerLock: Secure Ops uses free third-party 3D models, one texture and one HDRI. **Every asset used is CC0 1.0 Universal (public domain dedication)**, so no attribution is legally required. We credit the creators anyway.", "",
 "Licences were checked on 2026-10-10 on each pack's own page (Quaternius, Kenney, Poly Haven) and in the licence file shipped inside each download. The licence files are kept next to the unpacked sources in `blender/source-assets/vendor/`. Machine-readable details, including which source model ended up in which rendered sprite, are in [`asset-manifest.json`](asset-manifest.json).", "",
 "Only items that were actually imported and rendered are listed. Unused files from the downloaded packs were removed from the repository to keep it small.", "",
 "| Source | Creator | Original file | Licence | Licence file |", "|---|---|---|---|---|"]
for s in m["sources"]:
    out.append(f"| [{s['name']}]({s['source_url']}) | {s['creator']} | `{s['original_filename']}` | [{s['license']}]({s['license_url']}) | `{s['license_file']}` |")
out += ["", "## What was used", ""]
for s in m["sources"]:
    out.append(f"### {s['name']}")
    out.append(f"Downloaded from {s['download_url'].split('?')[0]} (official page: {s['source_url']}).")
    out.append("")
    for it in s["items"]:
        sp = it["rendered_into"]
        out.append(f"- `{it['file']}` ({it['role']}) -> {len(sp)} sprite(s): " + ", ".join(f"`{x}`" for x in sp[:6]) + (" ..." if len(sp) > 6 else ""))
    out.append("")
out += ["## Notes", "",
 "- **Quaternius packs** are the *Standard (free)* editions. The *Source/Pro* paid editions were not used.",
 "- The models were restyled in Blender: original materials were replaced with the LedgerLock palette and Poly Haven's `anti_skid_tiles` texture is used on the corridor floor. The character gains workwear, a tool belt, shoulder kit, ID badge and cap that were modelled for this project.",
 "- Custom props (racks, consoles, card terminal, BACS case, secure cabinet, Fabric nodes, bugs, malware, effects, tool icons) were modelled for this project in Blender and have no third-party source.",
 "- The Poly Haven HDRI (`blue_photo_studio_1k.hdr`) is used only for lighting at render time and is not shipped to the browser.",
 "- Sound effects are synthesised in the browser with the Web Audio API; no audio files are bundled.",
 "- No real organisations, people or branding appear in the game. The in-game ID badge is generic.", ""]
(ROOT / "ATTRIBUTION.md").write_text("\n".join(out))
print("ATTRIBUTION.md written")
