# Attribution and licences

LedgerLock: Secure Ops uses free third-party 3D models, one texture and one HDRI. **Every asset used is CC0 1.0 Universal (public domain dedication)**, so no attribution is legally required. We credit the creators anyway.

Licences were checked on 2026-10-10 on each pack's own page (Quaternius, Kenney, Poly Haven) and in the licence file shipped inside each download. The licence files are kept next to the unpacked sources in `blender/source-assets/vendor/`. Machine-readable details, including which source model ended up in which rendered sprite, are in [`asset-manifest.json`](asset-manifest.json).

Only items that were actually imported and rendered are listed. Unused files from the downloaded packs were removed from the repository to keep it small.

| Source | Creator | Original file | Licence | Licence file |
|---|---|---|---|---|
| [Modular SciFi MegaKit (Standard, free)](https://quaternius.com/packs/modularscifimegakit.html) | Quaternius | `Modular SciFi MegaKit[Standard].zip` | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | `blender/source-assets/vendor/quaternius-modular-scifi-megakit/Modular SciFi MegaKit[Standard]/License_Standard.txt` |
| [Universal Base Characters (Standard, free)](https://quaternius.com/packs/universalbasecharacters.html) | Quaternius | `Universal Base Characters[Standard].zip` | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | `blender/source-assets/vendor/quaternius-universal-base-characters/Universal Base Characters[Standard]/License_Standard.txt` |
| [Universal Animation Library (Standard, free)](https://quaternius.com/packs/universalanimationlibrary.html) | Quaternius | `Universal Animation Library[Standard].zip` | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | `blender/source-assets/vendor/quaternius-universal-animation-library/Universal Animation Library[Standard]/License.txt` |
| [Furniture Kit 2.0](https://kenney.nl/assets/furniture-kit) | Kenney | `kenney_furniture-kit.zip` | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) | `blender/source-assets/vendor/kenney-furniture-kit/License.txt` |
| [Poly Haven (anti_skid_tiles texture, blue_photo_studio HDRI)](https://polyhaven.com/a/anti_skid_tiles) | Amal Kumar (anti_skid_tiles); Sergej Majboroda (blue_photo_studio) | `anti_skid_tiles_diff_1k.jpg; anti_skid_tiles_nor_gl_1k.jpg; blue_photo_studio_1k.hdr` | [CC0 1.0 Universal](https://polyhaven.com/license) | `blender/source-assets/vendor/polyhaven/LICENSE.txt` |

## What was used

### Modular SciFi MegaKit (Standard, free)
Downloaded from https://quaternius.itch.io/modular-sci-fi-megakit (official page: https://quaternius.com/packs/modularscifimegakit.html).

- `Platforms/Platform_Metal.gltf` (floor) -> 1 sprite(s): `floor_b`
- `Platforms/Platform_DarkPlates.gltf` (floor) -> 1 sprite(s): `floor_dark`
- `Platforms/Platform_Squares.gltf` (floor) -> 1 sprite(s): `floor_a`
- `Platforms/Platform_CenterPlate.gltf` (floor) -> 1 sprite(s): `floor_door`
- `Platforms/Door_Frame_Square.gltf` (door) -> 4 sprite(s): `door_n_closed`, `door_n_open`, `door_w_closed`, `door_w_open`
- `Platforms/Door_Simple.gltf` (door) -> 4 sprite(s): `door_n_closed`, `door_n_open`, `door_w_closed`, `door_w_open`
- `Walls/WallBand_Straight.gltf` (wall) -> 2 sprite(s): `wall_n_band`, `wall_w_band`
- `Walls/WallWindow_Straight.gltf` (wall) -> 2 sprite(s): `wall_n_window`, `wall_w_window`
- `Walls/ShortWall_WhitePlate2_Straight.gltf` (wall) -> 2 sprite(s): `wall_n_plate`, `wall_w_plate`
- `Walls/ShortWall_Band2_Straight.gltf` (wall) -> 2 sprite(s): `wall_e_low`, `wall_s_low`
- `Walls/WallBand_Corner_Square_Outer.gltf` (wall) -> 1 sprite(s): `wall_corner_nw`
- `Walls/TopCables_Straight.gltf` (wall) -> 1 sprite(s): `cable_run`
- `Columns/Column_Pipes.gltf` (pillar) -> 2 sprite(s): `d_pipes_col`, `pillar_pipes`
- `Columns/Column_Simple.gltf` (pillar) -> 1 sprite(s): `pillar`
- `Props/Prop_Computer.gltf` (equipment) -> 4 sprite(s): `i_terminal_blue`, `i_terminal_cyan`, `i_terminal_mint`, `i_terminal_violet`
- `Props/Prop_Light_Wide.gltf` (light) -> 6 sprite(s): `i_rack_amber`, `i_rack_blue`, `i_rack_cyan`, `i_rack_mint`, `i_rack_periwinkle`, `i_rack_violet`
- `Props/Prop_Cable_3.gltf` (cable) -> 1 sprite(s): `d_cable_tray`
- `Props/Prop_Vent_Big.gltf` (equipment) -> 1 sprite(s): `d_vent`
- `Props/Prop_AccessPoint.gltf` (equipment) -> 1 sprite(s): `i_console_ops`
- `Props/Prop_ItemHolder.gltf` (equipment) -> 1 sprite(s): `d_itemholder`
- `Props/Prop_Crate3.gltf` (storage) -> 2 sprite(s): `d_box`, `d_crate`
- `Props/Prop_Chest.gltf` (storage) -> 1 sprite(s): `d_chest`
- `Props/Prop_Fan_Small.gltf` (equipment) -> 1 sprite(s): `d_fan`
- `Props/Prop_Light_Floor.gltf` (light) -> 1 sprite(s): `d_floorlight`

### Universal Base Characters (Standard, free)
Downloaded from https://quaternius.itch.io/universal-base-characters (official page: https://quaternius.com/packs/universalbasecharacters.html).

- `Superhero_Male_FullBody.gltf` (character) -> 88 sprite(s): `eng_ne_idle_0`, `eng_ne_idle_1`, `eng_ne_repair_0`, `eng_ne_repair_1`, `eng_ne_repair_2`, `eng_ne_repair_3` ...

### Universal Animation Library (Standard, free)
Downloaded from https://quaternius.itch.io/universal-animation-library (official page: https://quaternius.com/packs/universalanimationlibrary.html).

- `UAL1_Standard.glb` (animations) -> 88 sprite(s): `eng_ne_idle_0`, `eng_ne_idle_1`, `eng_ne_repair_0`, `eng_ne_repair_1`, `eng_ne_repair_2`, `eng_ne_repair_3` ...

### Furniture Kit 2.0
Downloaded from https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip (official page: https://kenney.nl/assets/furniture-kit).

- `desk.glb` (desk) -> 1 sprite(s): `d_desk_set`
- `deskCorner.glb` (desk) -> 1 sprite(s): `d_desk_laptop`
- `chairDesk.glb` (chair) -> 2 sprite(s): `d_chair`, `d_desk_set`
- `computerScreen.glb` (computer) -> 1 sprite(s): `d_desk_set`
- `computerKeyboard.glb` (computer) -> 1 sprite(s): `d_desk_set`
- `laptop.glb` (computer) -> 1 sprite(s): `d_desk_laptop`
- `bookcaseClosedDoors.glb` (storage) -> 1 sprite(s): `d_bookcase`
- `bookcaseClosed.glb` (storage) -> 1 sprite(s): `d_bookcase2`
- `pottedPlant.glb` (decor) -> 1 sprite(s): `d_plant`
- `plantSmall1.glb` (decor) -> 1 sprite(s): `d_plant_small`
- `kitchenCoffeeMachine.glb` (kitchen) -> 1 sprite(s): `i_coffee`
- `sideTableDrawers.glb` (furniture) -> 1 sprite(s): `i_coffee`
- `tableCoffeeSquare.glb` (furniture) -> 1 sprite(s): `d_table`
- `loungeSofa.glb` (furniture) -> 1 sprite(s): `d_sofa`
- `lampRoundFloor.glb` (light) -> 1 sprite(s): `d_lamp`
- `coatRack.glb` (furniture) -> 1 sprite(s): `d_coatrack`
- `cardboardBoxClosed.glb` (storage) -> 1 sprite(s): `d_box`
- `rugRectangle.glb` (decor) -> 1 sprite(s): `d_rug`

### Poly Haven (anti_skid_tiles texture, blue_photo_studio HDRI)
Downloaded from https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/anti_skid_tiles/anti_skid_tiles_diff_1k.jpg (official page: https://polyhaven.com/a/anti_skid_tiles).

- `anti_skid_tiles_diff_1k.jpg` (material) -> 1 sprite(s): `floor_corridor`
- `blue_photo_studio_1k.hdr` (lighting (render-time only, not shipped)) -> 191 sprite(s): `bug_fixed`, `bug_gremlin`, `cable_run`, `corrupt_file`, `d_bookcase`, `d_bookcase2` ...

## Notes

- **Quaternius packs** are the *Standard (free)* editions. The *Source/Pro* paid editions were not used.
- The models were restyled in Blender: original materials were replaced with the LedgerLock palette and Poly Haven's `anti_skid_tiles` texture is used on the corridor floor. The character gains workwear, a tool belt, shoulder kit, ID badge and cap that were modelled for this project.
- Custom props (racks, consoles, card terminal, BACS case, secure cabinet, Fabric nodes, bugs, malware, effects, tool icons) were modelled for this project in Blender and have no third-party source.
- The Poly Haven HDRI (`blue_photo_studio_1k.hdr`) is used only for lighting at render time and is not shipped to the browser.
- Sound effects are synthesised in the browser with the Web Audio API; no audio files are bundled.
- No real organisations, people or branding appear in the game. The in-game ID badge is generic.
