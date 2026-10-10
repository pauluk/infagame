# Art pipeline: Blender -> Phaser

Phaser is 2D. The 3D look comes from **Blender renders used as 2D sprites**. `.blend` files are never loaded in the browser.

```
blender/asset-selection.json  ->  import_assets.py  ->  build_facility.py  ->  ledgerlock_facility.blend
                                                       render_sprites.py (+ sprite_jobs.py)  ->  blender/renders-raw/*.png + meta.jsonl
                                                       pack_atlas.py  ->  public/assets/<group>/atlas.png|json + asset-manifest.json
                                                       make_attribution.py  ->  ATTRIBUTION.md
```

**One command:** `npm run assets:render` (finds Blender via `$BLENDER`, `PATH` or a few common install paths; packing needs Python 3 + Pillow). It rebuilds the scene, renders all 191 sprites (about 20-40 minutes on 4 CPU cores; `LL_SAMPLES=24` gives a faster draft), packs the atlases and rewrites `asset-manifest.json` and `ATTRIBUTION.md`. To re-render a subset after a full run has populated the git-ignored `blender/renders-raw/`: `npm run assets:render -- --only i_rack_cyan,eng_se_walk_0`. Without Blender the committed atlases still work.

## Scene

`build_facility.py` imports the pieces listed in `asset-selection.json` into collections `Library_<pack>/LIB.<id>`, builds custom items into `Library_custom`, applies the palette, creates the Secure Ops engineer, sets lighting and the camera, hides the library collections from the view layer and saves `blender/source/ledgerlock_facility.blend`. Named collections: Rooms, Walls, Floors, Props, Characters, Creatures, Effects, Lighting, Camera, Library_*.

## Restyling

MegaKit/Kenney materials are replaced by palette materials (`restyle_material` in `common.py`): restrained steel/white panels, navy trims, emissive cyan screens and strips, amber warning lights. Poly Haven `anti_skid_tiles` (multiplied by a steel-blue tint) covers the corridor floor. Interactive props sit on an emissive accent pad (distinct from decoration); decor has no pad.

## Camera, scale and grid

Orthographic camera at azimuth 45 deg, elevation 30 deg, so a ground cell projects to an exact 2:1 diamond. One cell is 1.2 m. Sprites are rendered at 2x (`RENDER_SCALE`): a cell is 96 x 48 px in the atlas and 48 x 24 px on screen (`ATLAS_SCALE = 2`). Game +X maps to Blender +X and game +Y to Blender -Y, so `screenX ~ (gx - gy)`, `screenY ~ (gx + gy)` matches the Phaser projection. Every sprite has a *fixed ground pivot* (cell centre) stored in its atlas frame (`pivot`), so the character never jumps between facings or frames.

## Character

Base mesh from Universal Base Characters; UAL actions are retargeted by assigning them to the same-named bones (identical skeleton): `Idle_Loop`, `Walk_Loop`, `Interact` (scan), `Fixing_Kneeling` (repair), `Dance_Loop` (success). Workwear is built by duplicating the skinned mesh, keeping faces by dominant bone group (jacket / trousers / boots), inflating them slightly and assigning teal/navy materials; the tool belt, shoulder kit, ID badge (generic, no branding) and cap are rigid meshes weighted to one bone each. Facings: `se`, `sw`, `nw`, `ne` (= game +X, +Y, -X, -Y movement).

## Shadows and quality

Soft shadows are baked with a Cycles shadow-catcher plane (denoising is disabled for those renders because OIDN breaks catcher alpha; 64 samples). Sprites without shadows use OIDN. Atlases are trimmed and packed (4.4 MB total). `LL_SAMPLES=24 npm run assets:render` is a faster, noisier draft.

## Atlas groups

`environment` (floors, walls, doors/gates, readers, pillars, external nodes, entrance), `props` (interactive `i_*` with pads, decor `d_*`), `characters` (88 frames), `effects` (bugs, malware, wisp, corrupt file, duplicate ghost, scan ring, quarantine, repair, success, status lights), `ui` (tool icons, cropped into the DOM tool belt).
