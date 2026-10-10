"""Declarative sprite catalogue: what to render, from which library items, with which canvas/pivot.

Units are metres in Blender space (cell = 1.2 m). Game +X = Blender +X, game +Y = Blender -Y.
Canvas sizes are in render pixels (RENDER_SCALE = 2 -> divide by 2 for on-screen size).
`pivot` is the pixel inside the canvas where the ground footpoint (0,0,0) lands.
"""
import math

CELL = 1.2
JOBS = []

def P(lib, at=(0, 0, 0), rz=0.0, s=1.0, sz=None):
    return dict(lib=lib, at=at, rz=rz, s=s, sz=sz)

def job(name, group, parts, canvas=(192, 192), pivot=(96, 140), shadow=True, zoom=1.0, **kw):
    JOBS.append(dict(name=name, group=group, parts=parts, canvas=canvas, pivot=pivot, shadow=shadow, zoom=zoom, kind="assembly", **kw))

# ------------------------------------------------------------------ environment ----
SLAB = [P("slab")]
for n, plat in (("floor_a", "mk_platform_squares"), ("floor_b", "mk_platform_metal"), ("floor_dark", "mk_platform_darkplates"), ("floor_door", "mk_platform_centerplate")):
    job(n, "environment", SLAB + [P(plat, (0, 0, 0.0), s=1.0)], canvas=(96, 64), pivot=(48, 28), shadow=False)
job("floor_corridor", "environment", SLAB + [P("tile_corridor")], canvas=(96, 64), pivot=(48, 28), shadow=False)

WALLS = [("band", "mk_wallband_straight"), ("window", "mk_wallwindow_straight"), ("plate", "mk_shortwall_whiteplate2")]
for tag, lib in WALLS:
    job(f"wall_n_{tag}", "environment", SLAB + [P("tile_floor_dark"), P(lib, rz=-90)], canvas=(96, 160), pivot=(48, 124), shadow=False)
    job(f"wall_w_{tag}", "environment", SLAB + [P("tile_floor_dark"), P(lib, rz=0)], canvas=(96, 160), pivot=(48, 124), shadow=False)
job("wall_s_low", "environment", SLAB + [P("tile_floor_dark"), P("mk_shortwall_band2", rz=90)], canvas=(96, 112), pivot=(48, 76), shadow=False)
job("wall_e_low", "environment", SLAB + [P("tile_floor_dark"), P("mk_shortwall_band2", rz=180)], canvas=(96, 112), pivot=(48, 76), shadow=False)
job("wall_corner_nw", "environment", SLAB + [P("tile_floor_dark"), P("mk_wallband_corner", rz=0)], canvas=(96, 160), pivot=(48, 124), shadow=False)
job("pillar", "environment", SLAB + [P("tile_floor_dark"), P("mk_column_simple")], canvas=(96, 192), pivot=(48, 156), shadow=False)
job("pillar_pipes", "environment", SLAB + [P("tile_floor_dark"), P("mk_column_pipes")], canvas=(96, 192), pivot=(48, 156), shadow=False)
job("cable_run", "environment", SLAB + [P("tile_floor_dark"), P("mk_topcables_straight", (0, 0, -2.6), rz=-90)], canvas=(96, 160), pivot=(48, 124), shadow=False)

# door spans 2 cells; anchor = centre of the span on the wall line
for st, lamp in (("closed", "door_lamp_closed"), ("open", "door_lamp_open")):
    for side, rz, off in (("n", -90, (0, 0.6)), ("w", 0, (-0.6, 0))):
        parts = SLAB + [P("slab", (0.6, 0, 0)) if side == "n" else P("slab", (0, -0.6, 0))]
        parts = [P("slab", (-0.6, 0, 0)), P("slab", (0.6, 0, 0))] if side == "n" else [P("slab", (0, -0.6, 0)), P("slab", (0, 0.6, 0))]
        parts += [P("mk_door_frame_square", (off[0], off[1], 0), rz=rz, s=1.65, sz=0.9)]
        panel = 0 if st == "closed" else 0.95
        for sgn in (-1, 1):
            if side == "n":
                parts.append(P("mk_door_simple", (sgn * (0.58 + panel), off[1], 0), rz=0, s=1.7, sz=0.9))
            else:
                parts.append(P("mk_door_simple", (off[0], sgn * (0.58 + panel), 0), rz=90, s=1.7, sz=0.9))
        parts.append(P(lamp, (off[0], off[1], 1.45), rz=rz + 90 if side == "w" else 0))
        job(f"door_{side}_{st}", "environment", parts, canvas=(192, 176), pivot=(96, 140), shadow=False)
for st in ("closed", "open"):
    job(f"gate_s_{st}", "environment", [P("slab", (-0.6, 0, 0)), P("slab", (0.6, 0, 0)), P(f"gate_{st}", (0, -0.0, 0))], canvas=(192, 120), pivot=(96, 82), shadow=False)
    job(f"gate_e_{st}", "environment", [P("slab", (0, -0.6, 0)), P("slab", (0, 0.6, 0)), P(f"gate_{st}", (0, 0, 0), rz=90)], canvas=(192, 120), pivot=(96, 82), shadow=False)
job("reader", "environment", [P("reader")], canvas=(64, 96), pivot=(32, 76), shadow=False)
job("reader_ok", "environment", [P("reader_ok")], canvas=(64, 96), pivot=(32, 76), shadow=False)
for n, c in (("dock_cyan", "dock_cyan"), ("dock_blue", "dock_blue"), ("dock_violet", "dock_violet"), ("dock_mint", "dock_mint")):
    job("ext_" + n, "environment", [P(c)], canvas=(384, 288), pivot=(192, 232), shadow=True)
job("entrance_gate", "environment", [P("entrance_gate", (0, 0, 0))], canvas=(320, 240), pivot=(160, 200), shadow=True)

# --------------------------------------------------------------------- props ----
def iprop(name, accent, parts, canvas=(192, 224), pivot=(96, 168)):
    job("i_" + name, "props", [P("pad_" + accent)] + parts, canvas=canvas, pivot=pivot)

for a in ("cyan", "blue", "mint", "violet", "periwinkle", "amber"):
    iprop("rack_" + a, a, [P("rack_" + a), P("mk_prop_light_wide", (0, -0.2, 1.84), s=0.45)])
iprop("console_ledger", "mint", [P("console_ledger")])
iprop("console_payment", "blue", [P("console_payment")])
iprop("console_api", "cyan", [P("console_api")])
iprop("console_ops", "amber", [P("console_ops"), P("mk_prop_accesspoint", (0.3, 0.0, 0.0), s=0.5)])
iprop("console_debt", "violet", [P("console_debt")])
iprop("console_event", "cyan", [P("console_event")])
iprop("console_integ", "cyan", [P("console_integ")])
iprop("terminal_card", "mint", [P("terminal_card", s=1.25)])
for a in ("cyan", "blue", "violet", "mint"):
    iprop("terminal_" + a, a, [P("mk_prop_computer", (0, 0.05, 0), s=0.85)])
iprop("case_bacs", "blue", [P("case_bacs")])
iprop("cabinet_secure", "blue", [P("cabinet_secure")], canvas=(192, 256), pivot=(96, 200))
for n, a in (("bronze", "periwinkle"), ("silver", "periwinkle"), ("gold", "periwinkle")):
    iprop("node_" + n, a, [P("node_" + n)])
iprop("screen_dashboard", "periwinkle", [P("screen_dashboard")], canvas=(224, 256), pivot=(112, 200))
iprop("screen_alert", "amber", [P("screen_alert")], canvas=(224, 256), pivot=(112, 200))
iprop("table_map", "amber", [P("table_map")])
iprop("coffee", "amber", [P("kn_sideTableDrawers", (0, 0, 0)), P("kn_kitchenCoffeeMachine", (0, 0, 0.58))])

def dprop(name, parts, canvas=(192, 192), pivot=(96, 150), shadow=True):
    job("d_" + name, "props", parts, canvas=canvas, pivot=pivot, shadow=shadow)
dprop("desk_set", [P("kn_desk"), P("kn_computerScreen", (0.0, 0.15, 0.78)), P("kn_computerKeyboard", (0.0, -0.05, 0.78)), P("kn_chairDesk", (0.0, -0.75, 0), rz=0)], canvas=(224, 208), pivot=(112, 160))
dprop("desk_laptop", [P("kn_deskCorner"), P("kn_laptop", (0.0, 0.0, 0.78))])
dprop("chair", [P("kn_chairDesk")])
dprop("plant", [P("kn_pottedPlant", s=1.9)])
dprop("plant_small", [P("kn_plantSmall1", s=2.2)])
dprop("bookcase", [P("kn_bookcaseClosedDoors")], canvas=(192, 224), pivot=(96, 176))
dprop("bookcase2", [P("kn_bookcaseClosed")], canvas=(192, 224), pivot=(96, 176))
dprop("sofa", [P("kn_loungeSofa", s=1.3)], canvas=(224, 192), pivot=(112, 150))
dprop("table", [P("kn_tableCoffeeSquare")])
dprop("lamp", [P("kn_lampRoundFloor", s=1.3)])
dprop("coatrack", [P("kn_coatRack")], canvas=(160, 224), pivot=(80, 180))
dprop("box", [P("kn_cardboardBoxClosed"), P("mk_prop_crate3", (0.5, 0.2, 0.25), s=0.5)])
dprop("rug", [P("kn_rugRectangle")], shadow=False, canvas=(224, 128), pivot=(112, 64))
dprop("crate", [P("mk_prop_crate3", (0, 0, 0.5), s=0.9)])
dprop("fan", [P("mk_prop_fan_small", (0, 0, 0.9), s=0.4)])
dprop("itemholder", [P("mk_prop_itemholder", s=1.0)])
dprop("chest", [P("mk_prop_chest", (0, 0, 0.5), s=0.4)])
dprop("floorlight", [P("mk_prop_light_floor", s=1.0)], shadow=False)
dprop("cable_tray", [P("mk_prop_cable_3", (0, 0, 0.01), s=1.0)], shadow=False)
dprop("vent", [P("mk_prop_vent_big", (0, 0, 0.01), s=0.6)], shadow=False)
dprop("pipes_col", [P("mk_column_pipes")], canvas=(96, 192), pivot=(48, 156))

# ------------------------------------------------------------ characters ----
FACINGS = {"se": 0, "sw": -90, "nw": 180, "ne": 90}      # facing direction as yaw about Z (+X = game +gx)
POSES = {
    "idle":    ("Idle_Loop",       [0, 30]),
    "walk":    ("Walk_Loop",       [0, 4, 8, 12, 16, 20, 24, 28]),
    "scan":    ("Interact",        [10, 18, 26, 34]),
    "repair":  ("Fixing_Kneeling", [20, 45, 70, 95]),
    "success": ("Dance_Loop",      [0, 6, 12, 18]),
}
for f, yaw in FACINGS.items():
    for pose, (action, frames) in POSES.items():
        for i, fr in enumerate(frames):
            JOBS.append(dict(name=f"eng_{f}_{pose}_{i}", group="characters", kind="char", facing=f, yaw=yaw, action=action, frame=fr,
                             canvas=(160, 176), pivot=(80, 138), shadow=True, zoom=1.0, parts=[]))

# ----------------------------------------------------- creatures / effects / ui ----
for n in ("bug_gremlin", "bug_fixed", "malware_spike", "wisp", "corrupt_file", "ghost_receipt"):
    job(n, "effects", [P(n)], canvas=(144, 144), pivot=(72, 108), zoom=1.7)
job("fx_scan_ring", "effects", [P("fx_scan_ring")], canvas=(160, 96), pivot=(80, 56), shadow=False)
job("fx_quarantine_amber", "effects", [P("fx_quarantine_amber")], canvas=(160, 160), pivot=(80, 120), shadow=False)
job("fx_quarantine_coral", "effects", [P("fx_quarantine_coral")], canvas=(160, 160), pivot=(80, 120), shadow=False)
job("fx_repair", "effects", [P("fx_repair")], canvas=(128, 128), pivot=(64, 100), shadow=False)
job("fx_success", "effects", [P("fx_success")], canvas=(160, 144), pivot=(80, 104), shadow=False)
for c in ("mint", "amber", "coral", "cyan"):
    job("fx_light_" + c, "effects", [P("fx_light_" + c)], canvas=(48, 48), pivot=(24, 38), shadow=False, zoom=2.0)
for t in ("scanner", "lens", "quarantine", "patch", "token", "restore", "recon", "reroute"):
    job("tool_" + t, "ui", [P("tool_" + t)], canvas=(112, 112), pivot=(56, 84), shadow=False, zoom=2.2)
