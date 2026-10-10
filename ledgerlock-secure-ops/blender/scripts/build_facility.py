"""Build the master LedgerLock facility Blender scene.

  blender -b -P blender/scripts/build_facility.py

* imports the selected CC0 packs (import_assets.py) into Library_* collections,
* builds the custom finance props, the Secure Ops engineer, bugs/malware and effect meshes,
* applies the palette, lighting and the fixed 2:1 isometric camera,
* saves blender/source/ledgerlock_facility.blend (sprite jobs in sprite_jobs.py are rendered by render_sprites.py).
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *
import import_assets as ia
import bmesh

CUSTOM = get_collection  # alias

def newlib(name):
    return get_collection("LIB." + name, get_collection("Library_custom"))

def M(name):
    d = {
        "steel": lambda: pmat("LL_steel", "steel", 0.5, 0.12),
        "steel2": lambda: pmat("LL_steel2", "#2B4263", 0.5, 0.1),
        "mid": lambda: pmat("LL_panel_mid", "panel_mid", 0.5, 0.1),
        "light": lambda: pmat("LL_panel_light", "panel_light", 0.5, 0.1),
        "white": lambda: pmat("LL_white", "white", 0.5),
        "black": lambda: pmat("LL_black", "navy", 0.35, 0.3),
        "skin": lambda: pmat("LL_skin", "#D9A47A", 0.7),
        "teal": lambda: pmat("LL_jacket", "#1FB5AE", 0.6),
        "workpants": lambda: pmat("LL_pants", "#22344F", 0.7),
        "boots": lambda: pmat("LL_boots", "#10192A", 0.5),
        "belt": lambda: pmat("LL_belt", "#3A2F26", 0.6),
        "bronze": lambda: pmat("LL_bronze", "#C98A4B", 0.35, 0.9),
        "silver": lambda: pmat("LL_silver", "#D5DCE6", 0.25, 0.95),
        "gold": lambda: pmat("LL_gold", "#F2C14E", 0.3, 0.95),
        "paper": lambda: pmat("LL_paper", "#F3F6FA", 0.8),
    }
    if name in d: return d[name]()
    return emissive("LL_em_" + name.lstrip("#"), name, 4.0)

ACCENTS = ["cyan", "blue", "mint", "violet", "periwinkle", "amber", "coral"]

# ---------------------------------------------------------------- finance props (front faces -Y) ----
def build_pad(accent):
    c = newlib("pad_" + accent)
    box("pad", (1.0, 1.0, 0.03), (0, 0, 0.015), emissive("LL_pad_" + accent, accent, 1.6), c, bevel=0.012)
    box("padframe", (1.06, 1.06, 0.02), (0, 0, 0.01), M("steel"), c, bevel=0.01)

def build_rack(accent, tall=1.75):
    c = newlib("rack_" + accent)
    box("body", (0.72, 0.56, tall), (0, 0, tall / 2), M("steel"), c, 0.02)
    box("front", (0.62, 0.02, tall - 0.2), (0, -0.285, tall / 2), M("black"), c, 0.005)
    n = int((tall - 0.3) / 0.2)
    for i in range(n):
        z = 0.2 + i * 0.2
        box(f"unit{i}", (0.56, 0.03, 0.15), (0, -0.3, z), M("steel2") if i % 2 else M("mid"), c, 0.006)
        box(f"led{i}", (0.045, 0.035, 0.045), (-0.22, -0.32, z), M(accent), c, 0.004)
        box(f"led2{i}", (0.03, 0.03, 0.03), (-0.14, -0.32, z), M("mint") if i % 3 else M("amber"), c, 0.003)
        box(f"slot{i}", (0.22, 0.03, 0.03), (0.12, -0.32, z), M("black"), c, 0.002)
    box("top", (0.76, 0.6, 0.04), (0, 0, tall + 0.02), M("mid"), c, 0.01)
    box("strip", (0.5, 0.02, 0.04), (0, -0.30, tall - 0.05), M(accent), c, 0.004)

def _screen(coll, name, size, loc, color, rot=(0, 0, 0), rows=0):
    s = box(name + "_bezel", (size[0] + 0.04, size[1], size[2] + 0.04), loc, M("black"), coll, 0.01, rot)
    f = box(name, (size[0], 0.012, size[2]), (loc[0], loc[1] - size[1] / 2 - 0.004, loc[2]), M("steel2"), coll, 0.0, rot)
    f.rotation_euler = rot
    return s

def _desk_console(coll, accent, w=1.0, screens=1, kind="ledger"):
    box("base", (w, 0.6, 0.78), (0, 0, 0.39), M("steel"), coll, 0.02)
    box("deck", (w + 0.06, 0.66, 0.05), (0, 0, 0.8), M("mid"), coll, 0.015)
    box("sloped", (w - 0.08, 0.34, 0.1), (0, -0.12, 0.88), M("steel2"), coll, 0.015, (math.radians(-16), 0, 0))
    # keys / buttons row
    for i in range(7):
        box(f"key{i}", (0.07, 0.05, 0.02), (-0.3 * w + i * 0.1 * w, -0.14, 0.94), M("white") if i % 2 else M(accent), coll, 0.004)
    sw = (w - 0.16) / screens
    for s in range(screens):
        x = -((screens - 1) * sw) / 2 + s * sw
        box(f"mon{s}", (sw - 0.06, 0.05, 0.42), (x, 0.17, 1.14), M("black"), coll, 0.012, (math.radians(-8), 0, 0))
        box(f"scr{s}", (sw - 0.12, 0.012, 0.34), (x, 0.138, 1.14), M(accent), coll, 0.0, (math.radians(-8), 0, 0))
        # content rows (ledger lines / chart bars)
        for r in range(5):
            if kind == "chart":
                h = 0.05 + 0.05 * ((r * 7 + s * 3) % 5)
                box(f"bar{s}{r}", (0.035, 0.01, h), (x - 0.12 + r * 0.06, 0.126, 1.0 + h / 2 - 0.05), M("white"), coll, 0.0, (math.radians(-8), 0, 0))
            else:
                box(f"line{s}{r}", (sw - 0.2, 0.01, 0.018), (x, 0.126, 1.26 - r * 0.06), M("white"), coll, 0.0, (math.radians(-8), 0, 0))
    box("stand", (0.12, 0.06, 0.12), (0, 0.2, 0.93), M("mid"), coll, 0.01)

def build_console(name, accent, w=1.0, screens=1, kind="ledger"):
    c = newlib(name)
    _desk_console(c, accent, w, screens, kind)

def build_card_terminal():
    c = newlib("terminal_card")
    cyl("pedestal", 0.1, 0.8, (0, 0, 0.4), M("steel"), c)
    cyl("foot", 0.28, 0.06, (0, 0, 0.03), M("mid"), c)
    box("body", (0.34, 0.24, 0.1), (0, -0.02, 0.88), M("white"), c, 0.03, (math.radians(-24), 0, 0))
    box("screen", (0.26, 0.012, 0.09), (0, -0.07, 0.915), M("mint"), c, 0.0, (math.radians(-24), 0, 0))
    for r in range(3):
        for k in range(3):
            box(f"k{r}{k}", (0.045, 0.012, 0.03), (-0.08 + k * 0.08, -0.06 - 0.0, 0.84 - r * 0.0), M("black"), c, 0.0)
    for i in range(9):
        r, k = divmod(i, 3)
        box(f"key{i}", (0.05, 0.05, 0.015), (-0.09 + k * 0.09, -0.01 + r * 0.055 - 0.09, 0.934 - r * 0.0 - 0.0 + 0.0), M("mid"), c, 0.004, (math.radians(-24), 0, 0))
    box("slot", (0.2, 0.03, 0.012), (0, 0.095, 0.915), M("black"), c, 0.0, (math.radians(-24), 0, 0))
    box("card", (0.14, 0.01, 0.09), (0, 0.11, 0.99), M("cyan"), c, 0.004, (math.radians(-24), 0, 0))

def build_bacs_case():
    c = newlib("case_bacs")
    box("plinth", (0.9, 0.5, 0.18), (0, 0, 0.09), M("steel"), c, 0.02)
    box("case", (0.8, 0.34, 0.52), (0, 0, 0.44), M("white"), c, 0.04)
    box("band", (0.82, 0.355, 0.12), (0, 0, 0.5), M("blue"), c, 0.02)
    for sx in (-0.28, 0.28):
        box("latch", (0.07, 0.04, 0.12), (sx, -0.19, 0.46), M("silver"), c, 0.01)
    box("handle", (0.3, 0.05, 0.05), (0, 0, 0.74), M("black"), c, 0.02)
    box("label", (0.26, 0.01, 0.1), (0, -0.176, 0.36), M("paper"), c, 0.0)
    for i in range(3):
        box(f"ln{i}", (0.2 - i * 0.04, 0.012, 0.012), (-0.02, -0.18, 0.39 - i * 0.03), M("black"), c, 0.0)

def build_cabinet_secure():
    c = newlib("cabinet_secure")
    box("body", (0.86, 0.66, 1.8), (0, 0, 0.9), M("steel"), c, 0.03)
    box("door", (0.76, 0.03, 1.62), (0, -0.345, 0.9), M("steel2"), c, 0.02)
    box("seam", (0.012, 0.035, 1.62), (0, -0.35, 0.9), M("black"), c, 0.0)
    cyl("wheel", 0.1, 0.04, (0.18, -0.38, 0.95), M("silver"), c, rot=(math.radians(90), 0, 0))
    box("pad", (0.16, 0.03, 0.22), (-0.2, -0.37, 1.05), M("black"), c, 0.01)
    box("padscr", (0.12, 0.012, 0.06), (-0.2, -0.39, 1.11), M("blue"), c, 0.0)
    for i in range(6):
        box(f"k{i}", (0.04, 0.012, 0.03), (-0.26 + (i % 3) * 0.06, -0.39, 1.0 - (i // 3) * 0.05), M("white"), c, 0.0)
    box("lock", (0.1, 0.03, 0.1), (-0.2, -0.375, 0.78), M("coral"), c, 0.01)
    box("stripe", (0.8, 0.036, 0.1), (0, -0.348, 1.6), M("blue"), c, 0.01)

def build_node(name, mat):
    c = newlib(name)
    cyl("base", 0.42, 0.1, (0, 0, 0.05), M("steel"), c, verts=6)
    cyl("col", 0.26, 0.9, (0, 0, 0.55), M(mat), c, verts=6)
    for i, z in enumerate((0.35, 0.7, 1.05)):
        torus(f"ring{i}", 0.3, 0.025, (0, 0, z), M("periwinkle"), c)
    cone("cap", 0.28, 0.0, 0.3, (0, 0, 1.15), M(mat), c, verts=6)
    sphere("orb", 0.09, (0, 0, 1.42), M("periwinkle"), c)

def build_big_screen(name, accent, kind):
    c = newlib(name)
    box("post", (0.12, 0.12, 0.7), (0, 0.1, 0.35), M("steel"), c, 0.01)
    box("foot", (0.7, 0.4, 0.06), (0, 0.1, 0.03), M("mid"), c, 0.02)
    box("frame", (1.5, 0.08, 0.95), (0, 0.1, 1.15), M("black"), c, 0.03)
    box("face", (1.4, 0.012, 0.85), (0, 0.058, 1.15), M("steel2"), c, 0.0)
    if kind == "dashboard":
        for i in range(6):
            h = 0.12 + 0.1 * ((i * 5) % 4)
            box(f"bar{i}", (0.1, 0.012, h), (-0.5 + i * 0.2, 0.05, 0.8 + h / 2), M(["periwinkle", "cyan", "mint"][i % 3]), c, 0.0)
        box("kpi", (0.5, 0.012, 0.16), (0.35, 0.05, 1.45), M("white"), c, 0.0)
        box("kpi2", (0.5, 0.012, 0.16), (-0.35, 0.05, 1.45), M("amber"), c, 0.0)
    else:
        for i in range(5):
            box(f"row{i}", (1.1, 0.012, 0.09), (0, 0.05, 1.45 - i * 0.16), M("amber") if i in (0, 3) else M("white"), c, 0.0)
            box(f"dot{i}", (0.07, 0.012, 0.07), (-0.62, 0.05, 1.45 - i * 0.16), M("coral") if i == 0 else M("mint"), c, 0.0)

def build_table_map():
    c = newlib("table_map")
    box("top", (1.1, 0.8, 0.06), (0, 0, 0.78), M("steel"), c, 0.02)
    for sx in (-0.45, 0.45):
        for sy in (-0.3, 0.3):
            box("leg", (0.06, 0.06, 0.78), (sx, sy, 0.39), M("mid"), c, 0.01)
    for gx in range(4):
        for gy in range(3):
            box(f"cell{gx}{gy}", (0.2, 0.2, 0.025), (-0.37 + gx * 0.25, -0.25 + gy * 0.25, 0.83), M(["cyan", "blue", "periwinkle", "mint"][(gx + gy) % 4]), c, 0.01)
    box("hint", (0.2, 0.2, 0.025), (0.38, 0.25, 0.86), M("amber"), c, 0.01)

def build_dock(name, accent):
    c = newlib(name)
    box("slab", (3.6, 3.6, 0.1), (0, 0, 0.05), M("steel"), c, 0.02)
    box("hall", (3.0, 2.8, 1.3), (0, 0.1, 0.75), M("light"), c, 0.04)
    box("roof", (3.2, 3.0, 0.1), (0, 0.1, 1.45), M("steel2"), c, 0.03)
    box("stripe", (3.04, 2.84, 0.16), (0, 0.1, 1.0), M(accent), c, 0.02)
    box("door", (0.9, 0.04, 0.9), (0, -1.32, 0.55), M("black"), c, 0.02)
    for i in range(3):
        box(f"win{i}", (0.5, 0.04, 0.3), (-1.0 + i * 1.0, -1.31, 1.12), M("steel2"), c, 0.01) if i != 1 else None
    box("sign", (1.8, 0.06, 0.34), (0, -1.36, 1.72), M("white"), c, 0.02)
    box("sign2", (1.7, 0.07, 0.07), (0, -1.38, 1.72), M(accent), c, 0.0)
    cyl("dish", 0.3, 0.05, (1.0, 0.5, 1.7), M("silver"), c, rot=(math.radians(50), 0, math.radians(30)))

def build_entrance():
    c = newlib("entrance_gate")
    for sx in (-1.7, 1.7):
        box("pylon", (0.5, 0.5, 1.9), (sx, 0, 0.95), M("steel"), c, 0.03)
        box("lamp", (0.3, 0.3, 0.12), (sx, 0, 1.96), M("light"), c, 0.02) if False else None
        box("lampem", (0.34, 0.1, 0.14), (sx, -0.26, 1.7), M("cyan"), c, 0.02)
    box("beam", (4.0, 0.4, 0.34), (0, 0, 2.05), M("white"), c, 0.03)
    box("beam_em", (3.4, 0.05, 0.1), (0, -0.22, 2.05), M("cyan"), c, 0.01)
    box("sill", (3.6, 0.8, 0.05), (0, 0, 0.025), M("mid"), c, 0.01)

def build_pad_items():
    for a in ACCENTS: build_pad(a)

def build_all_props():
    build_pad_items()
    for a in ACCENTS: build_rack(a)
    build_console("console_ledger", "mint", 1.0, 1, "ledger")
    build_console("console_payment", "blue", 1.1, 2, "ledger")
    build_console("console_api", "cyan", 1.1, 2, "chart")
    build_console("console_ops", "amber", 1.0, 1, "ledger")
    build_console("console_debt", "violet", 1.0, 1, "ledger")
    build_console("console_event", "cyan", 1.0, 1, "chart")
    build_console("console_integ", "cyan", 1.0, 2, "chart")
    build_card_terminal()
    build_bacs_case()
    build_cabinet_secure()
    build_node("node_bronze", "bronze"); build_node("node_silver", "silver"); build_node("node_gold", "gold")
    build_big_screen("screen_dashboard", "periwinkle", "dashboard")
    build_big_screen("screen_alert", "amber", "alerts")
    build_table_map()
    for n, a in (("dock_cyan", "cyan"), ("dock_blue", "blue"), ("dock_violet", "violet"), ("dock_mint", "mint")): build_dock(n, a)
    build_entrance()

# ------------------------------------------------------------------------- slabs / walls / readers ----
def build_env_extras():
    # floor slab edge used under every floor tile (1 cell)
    c = newlib("slab"); box("slab", (TILE_M, TILE_M, 0.14), (0, 0, -0.085), pmat("LL_slab", "#2A4062", 0.6, 0.0), c, 0.0)
    # solid floor top plane in palette colours (MegaKit platform detail is added on top in the job)
    for n, col in (("floor_a", "#C9D4E2"), ("floor_b", "#B6C4D6"), ("floor_dark", "#3A5072"), ("floor_door", "#9AB0C8")):
        c = newlib("tile_" + n)
        box("t", (TILE_M, TILE_M, 0.02), (0, 0, 0.01), pmat("LL_t_" + n, col, 0.7), c, 0.0)
    # corridor tile with Poly Haven anti-skid texture
    c = newlib("tile_corridor")
    bpy.ops.mesh.primitive_plane_add(size=TILE_M, location=(0, 0, 0.02))
    p = bpy.context.active_object; p.name = "corridor_top"; move_to_collection(p, c)
    m = bpy.data.materials.new("LL_ph_antiskid"); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = bpy.data.images.load(str(VENDOR / "polyhaven/anti_skid_tiles_diff_1k.jpg"), check_existing=True)
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs[0].default_value = 1.0
    mix.inputs[7].default_value = hex_rgba("#6E86A6")
    nt.links.new(tex.outputs["Color"], mix.inputs[6]); nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.6
    mp = nt.nodes.new("ShaderNodeMapping"); tc = nt.nodes.new("ShaderNodeTexCoord")
    mp.inputs["Scale"].default_value = (1.2, 1.2, 1.2)
    nt.links.new(tc.outputs["UV"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
    p.data.materials.append(m)
    # thin low-wall (S/E edge) and glass-free partial wall pieces from primitives for door frames
    c = newlib("reader")
    box("post", (0.16, 0.1, 0.62), (0, 0, 0.31), M("steel"), c, 0.015)
    box("head", (0.2, 0.12, 0.22), (0, -0.02, 0.62), M("black"), c, 0.02)
    box("screen", (0.14, 0.012, 0.1), (0, -0.083, 0.64), M("cyan"), c, 0.0)
    box("light", (0.06, 0.02, 0.05), (0, -0.085, 0.53), M("amber"), c, 0.0)
    c = newlib("reader_ok"); box("post", (0.16, 0.1, 0.62), (0, 0, 0.31), M("steel"), c, 0.015); box("head", (0.2, 0.12, 0.22), (0, -0.02, 0.62), M("black"), c, 0.02)
    box("screen", (0.14, 0.012, 0.1), (0, -0.083, 0.64), M("mint"), c, 0.0); box("light", (0.06, 0.02, 0.05), (0, -0.085, 0.53), M("mint"), c, 0.0)

def build_doors():
    for st, col in (("closed", "coral"), ("open", "mint")):
        c = newlib("door_lamp_" + st)
        box("lamp", (0.5, 0.05, 0.07), (0, 0, 0), M(col), c, 0.01)
        c = newlib("gate_" + st)           # 2-cell wide low gate, spans X, centred on origin, sits on the y=0 line
        for sx in (-1.15, 1.15):
            box("post", (0.14, 0.14, 0.62), (sx, 0, 0.31), M("steel"), c, 0.02)
            box("cap", (0.16, 0.16, 0.05), (sx, 0, 0.64), M(col), c, 0.01)
        if st == "closed":
            box("bar", (2.2, 0.05, 0.1), (0, 0, 0.42), M(col), c, 0.015)
            box("bar2", (2.2, 0.05, 0.06), (0, 0, 0.24), M("steel2"), c, 0.01)
        else:
            box("bar", (0.4, 0.05, 0.1), (-0.95, 0, 0.42), M(col), c, 0.015)
            box("bar2", (0.4, 0.05, 0.06), (0.95, 0, 0.42), M(col), c, 0.01)

# ----------------------------------------------------------------------------------- creatures ----
def build_creatures():
    # bug: friendly-ugly amber beetle ("Retry Gremlin") - a fixable software fault
    def bug(name, body, eye, legcol):
        c = newlib(name)
        sphere("body", 0.26, (0, 0, 0.3), M(body), c, (1.0, 1.25, 0.8))
        sphere("head", 0.15, (0, -0.3, 0.32), M(body), c, (1, 1, 0.9))
        for sx in (-0.07, 0.07):
            sphere("eye", 0.05, (sx, -0.42, 0.37), M("white"), c)
            sphere("pupil", 0.025, (sx, -0.465, 0.37), M("black"), c)
            cyl("ant", 0.012, 0.3, (sx * 1.6, -0.4, 0.55), M(legcol), c, rot=(math.radians(-20), 0, math.radians(sx * 300)))
            sphere("antball", 0.03, (sx * 2.2, -0.45, 0.68), M(eye), c)
        for i, y in enumerate((-0.12, 0.05, 0.22)):
            for sx in (-1, 1):
                cyl("leg", 0.015, 0.28, (sx * 0.26, y, 0.16), M(legcol), c, rot=(0, math.radians(sx * 50), 0))
        box("spot1", (0.1, 0.1, 0.02), (-0.08, 0.05, 0.5), M(eye), c, 0.01)
        box("spot2", (0.1, 0.1, 0.02), (0.1, 0.18, 0.46), M(eye), c, 0.01)
    bug("bug_gremlin", "amber", "coral", "steel")
    bug("bug_fixed", "mint", "cyan", "steel")
    # malware: clearly hostile coral spiky blob with angry eyes (harmless visual only)
    c = newlib("malware_spike")
    sphere("core", 0.3, (0, 0, 0.45), M("coral"), c)
    import random; random.seed(4)
    for i in range(14):
        a = i * 2.399963; z = 1 - (i + 0.5) / 7.0
        r = math.sqrt(max(0.0, 1 - z * z))
        d = Vector((math.cos(a) * r, math.sin(a) * r, z))
        loc = Vector((0, 0, 0.45)) + d * 0.38
        bpy.ops.mesh.primitive_cone_add(radius1=0.07, radius2=0.0, depth=0.26, location=loc)
        k = bpy.context.active_object; k.data.materials.append(M("coral"))
        k.rotation_euler = d.to_track_quat("Z", "Y").to_euler(); move_to_collection(k, c)
    for sx in (-0.1, 0.1):
        sphere("eye", 0.06, (sx, -0.27, 0.52), M("white"), c)
        box("brow", (0.14, 0.03, 0.03), (sx, -0.31, 0.62), M("black"), c, 0.0, (0, math.radians(sx * 300), math.radians(-sx * 160)))
        sphere("pupil", 0.03, (sx, -0.32, 0.52), M("black"), c)
    # glitch wisp: cyan translucent flame with bright core
    c = newlib("wisp")
    cone("flame", 0.2, 0.0, 0.75, (0, 0, 0.55), pmat("LL_wisp", "cyan", 0.2, 0, emit="cyan", emit_strength=2.4, alpha=0.7), c)
    sphere("core", 0.14, (0, 0, 0.3), M("white"), c)
    for i in range(3):
        box(f"glitch{i}", (0.22 - i * 0.04, 0.05, 0.05), (0.12 * (i - 1), 0, 0.2 + i * 0.22), M("violet"), c, 0.005)
    # corrupted file: torn document with glitch blocks
    c = newlib("corrupt_file")
    box("doc", (0.46, 0.05, 0.6), (0, 0, 0.45), M("paper"), c, 0.01)
    box("tear", (0.2, 0.06, 0.12), (0.17, 0, 0.66), pmat("LL_void", "#0B1424", 0.8), c, 0.0, (0, math.radians(18), 0))
    for i in range(4):
        box(f"gl{i}", (0.34 - i * 0.05, 0.06, 0.05), (-0.05 + i * 0.04, -0.01, 0.55 - i * 0.1), M("coral") if i % 2 == 0 else M("amber"), c, 0.0)
    box("fold", (0.1, 0.06, 0.1), (-0.18, 0, 0.7), M("steel"), c, 0.0, (0, math.radians(-30), 0))
    # ghost receipt: translucent receipt paper (the "Duplicate Ghost")
    c = newlib("ghost_receipt")
    gm = pmat("LL_ghost", "mint", 0.3, 0, emit="mint", emit_strength=0.8, alpha=0.62)
    box("paper", (0.4, 0.04, 0.66), (0, 0, 0.55), gm, c, 0.01)
    for i in range(5):
        box(f"ln{i}", (0.26 - (i % 2) * 0.08, 0.05, 0.025), (0, -0.01, 0.74 - i * 0.1), M("white"), c, 0.0)
    for sx in (-0.1, 0.1): sphere("eye", 0.045, (sx, -0.04, 0.3), M("black"), c)
    cone("tail", 0.2, 0.02, 0.28, (0, 0, 0.2), gm, c, rot=(math.radians(180), 0, 0))

# -------------------------------------------------------------------------------------- effects ----
def build_effects():
    c = newlib("fx_scan_ring")
    torus("r1", 0.55, 0.035, (0, 0, 0.04), M("cyan"), c); torus("r2", 0.35, 0.025, (0, 0, 0.04), M("white"), c)
    c = newlib("fx_quarantine_amber")
    for col, nm in (("amber", "fx_quarantine_amber"), ("coral", "fx_quarantine_coral")):
        c = newlib(nm)
        cyl("base", 0.55, 0.05, (0, 0, 0.03), pmat("LL_q_" + col, col, 0.5, emit=col, emit_strength=0.8), c, verts=6)
        for i in range(6):
            a = math.radians(60 * i)
            bx = box(f"post{i}", (0.05, 0.05, 0.9), (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.5), M(col), c, 0.005)
        cyl("topring", 0.55, 0.05, (0, 0, 0.95), M(col), c, verts=6)
        for i in range(6):
            a0 = math.radians(60 * i + 30)
            box(f"pane{i}", (0.02, 0.5, 0.82), (math.cos(a0) * 0.43, math.sin(a0) * 0.43, 0.5), pmat("LL_qfield_" + col, col, 0.2, 0, emit=col, emit_strength=0.25, alpha=0.22), c, 0.0, (0, 0, a0))
    c = newlib("fx_repair")
    cyl("gear", 0.3, 0.06, (0, 0, 0.45), M("mint"), c, rot=(math.radians(90), 0, 0), verts=10)
    cyl("hub", 0.12, 0.08, (0, 0, 0.45), M("navy" if False else "black"), c, rot=(math.radians(90), 0, 0))
    for i in range(8):
        a = math.radians(45 * i)
        box(f"tooth{i}", (0.1, 0.07, 0.1), (math.cos(a) * 0.33, 0, 0.45 + math.sin(a) * 0.33), M("mint"), c, 0.01, (0, -a, 0))
    for i, (x, z) in enumerate(((0.45, 0.8), (-0.4, 0.75), (0.1, 0.95), (-0.2, 0.3))):
        sphere(f"spark{i}", 0.05, (x, -0.05, z), M("white"), c)
    c = newlib("fx_success")
    for i in range(10):
        a = math.radians(36 * i)
        col = ["mint", "cyan", "amber", "periwinkle", "violet"][i % 5]
        bpy.ops.mesh.primitive_cone_add(radius1=0.06, radius2=0.0, depth=0.3, location=(math.cos(a) * 0.4, math.sin(a) * 0.4, 0.5 + 0.15 * math.sin(a * 2)))
        k = bpy.context.active_object; k.data.materials.append(M(col)); move_to_collection(k, c)
        k.rotation_euler = Vector((math.cos(a), math.sin(a), 0.4)).to_track_quat("Z", "Y").to_euler()
    sphere("star", 0.15, (0, 0, 0.5), M("white"), c)
    for col in ("mint", "amber", "coral", "cyan"):
        c = newlib("fx_light_" + col)
        cyl("base", 0.08, 0.04, (0, 0, 0.02), M("steel"), c)
        sphere("bulb", 0.07, (0, 0, 0.1), M(col), c)

# ---------------------------------------------------------------------------------- tool icons ----
def build_tool_icons():
    def lib(n): return newlib("tool_" + n)
    c = lib("scanner")
    cyl("grip", 0.07, 0.4, (0, 0, 0.25), M("steel"), c); cyl("head", 0.2, 0.12, (0, 0, 0.55), M("white"), c)
    torus("lens", 0.14, 0.03, (0, 0, 0.62), M("cyan"), c); sphere("dot", 0.07, (0, 0, 0.63), M("cyan"), c)
    c = lib("lens")
    torus("ring", 0.25, 0.05, (0, 0, 0.55), M("amber"), c, rot=(math.radians(90), 0, 0))
    cyl("glass", 0.23, 0.02, (0, 0, 0.55), pmat("LL_lensglass", "cyan", 0.1, alpha=0.4), c, rot=(math.radians(90), 0, 0))
    cyl("handle", 0.045, 0.4, (0.18, 0, 0.3), M("steel"), c, rot=(0, math.radians(35), 0))
    c = lib("quarantine")
    cyl("base", 0.28, 0.05, (0, 0, 0.05), M("coral"), c, verts=6)
    for i in range(6):
        a = math.radians(60 * i); box("p", (0.04, 0.04, 0.5), (math.cos(a) * 0.26, math.sin(a) * 0.26, 0.3), M("coral"), c, 0.0)
    cyl("top", 0.28, 0.05, (0, 0, 0.56), M("coral"), c, verts=6)
    c = lib("patch")
    box("shaft", (0.1, 0.06, 0.55), (0, 0, 0.35), M("silver"), c, 0.02, (0, math.radians(30), 0))
    cyl("jaw", 0.15, 0.06, (0.14, 0, 0.62), M("silver"), c, rot=(math.radians(90), 0, 0), verts=8); box("cut", (0.12, 0.08, 0.12), (0.2, 0, 0.7), M("black"), c, 0.0)
    box("grip", (0.1, 0.07, 0.2), (-0.1, 0, 0.12), M("mint"), c, 0.03, (0, math.radians(30), 0))
    c = lib("token")
    torus("ring", 0.2, 0.05, (0, 0, 0.55), M("gold"), c, rot=(math.radians(90), 0, 0))
    box("stem", (0.4, 0.07, 0.07), (0.0, 0, 0.3), M("gold"), c, 0.02, (0, math.radians(90), 0)); box("t1", (0.1, 0.07, 0.07), (0.12, 0, 0.18), M("gold"), c, 0.01); box("t2", (0.1, 0.07, 0.07), (-0.12, 0, 0.1), M("gold"), c, 0.01)
    torus("arrow", 0.3, 0.025, (0, 0, 0.55), M("cyan"), c, rot=(math.radians(90), 0, 0))
    c = lib("restore")
    cone("beacon", 0.22, 0.05, 0.55, (0, 0, 0.3), M("mint"), c); sphere("bulb", 0.14, (0, 0, 0.68), M("white"), c)
    torus("halo", 0.25, 0.03, (0, 0, 0.1), M("mint"), c)
    c = lib("recon")
    cyl("wand", 0.03, 0.75, (0, 0, 0.4), M("steel"), c, rot=(0, math.radians(25), 0))
    for i in range(5):
        a = math.radians(72 * i)
        bpy.ops.mesh.primitive_cone_add(radius1=0.06, radius2=0, depth=0.2, location=(0.16 + math.cos(a) * 0.14, 0, 0.78 + math.sin(a) * 0.14))
        k = bpy.context.active_object; k.data.materials.append(M("amber")); move_to_collection(k, c)
        k.rotation_euler = (0, -a + math.radians(90), 0)
    sphere("core", 0.08, (0.16, 0, 0.78), M("white"), c)
    c = lib("reroute")
    box("a1", (0.5, 0.1, 0.1), (0, 0, 0.62), M("blue"), c, 0.02); cone("h1", 0.16, 0.0, 0.25, (0.33, 0, 0.62), M("blue"), c, rot=(0, math.radians(90), 0))
    box("a2", (0.5, 0.1, 0.1), (0, 0, 0.36), M("mint"), c, 0.02); cone("h2", 0.16, 0.0, 0.25, (-0.33, 0, 0.36), M("mint"), c, rot=(0, math.radians(-90), 0))
    box("link", (0.1, 0.1, 0.3), (0.0, 0, 0.49), M("white"), c, 0.02)

# ------------------------------------------------------------------------------------- character ----
def build_character():
    arm, meshes, actions, ccoll, acoll = ia.import_character()
    body = next(m for m in meshes if m.name.startswith("SuperHero"))
    eyes = [m for m in meshes if m.name == "Eyes"]
    brows = [m for m in meshes if m.name == "Eyebrows"]
    # restyle base: flat stylised skin, dark eyes
    body.data.materials.clear(); body.data.materials.append(M("skin"))
    for m in eyes: m.data.materials.clear(); m.data.materials.append(pmat("LL_eye", "#1B2433", 0.3))
    for m in brows: m.data.materials.clear(); m.data.materials.append(pmat("LL_brow", "#2A2118", 0.6))
    # --- clothing: duplicate the skinned body, keep faces by dominant bone group, inflate slightly
    names = {i: g.name for i, g in enumerate(body.vertex_groups)}
    def region(gname):
        g = gname.lower()
        if any(k in g for k in ("upperarm", "lowerarm", "clavicle", "spine", "pelvis")): return "jacket"
        if any(k in g for k in ("thigh", "calf")): return "pants"
        if any(k in g for k in ("foot", "ball")): return "boots"
        return None
    cloth = body.copy(); cloth.data = body.data.copy(); cloth.name = "Workwear"
    ccoll.objects.link(cloth)
    cloth.parent = body.parent
    cloth.data.materials.clear()
    for n in ("teal", "workpants", "boots"): cloth.data.materials.append(M(n))
    bm = bmesh.new(); bm.from_mesh(cloth.data)
    dl = bm.verts.layers.deform.active
    mats = {"jacket": 0, "pants": 1, "boots": 2}
    def vreg(v):
        w = v[dl]
        if not w: return None
        gi = max(w.items(), key=lambda kv: kv[1])[0]
        return region(names.get(gi, ""))
    drop = []
    for f in bm.faces:
        regs = [vreg(v) for v in f.verts]
        r = max(set(regs), key=regs.count)
        if r is None: drop.append(f); continue
        f.material_index = mats[r]
    # keep the jacket above the hips only, trousers below the pelvis (pelvis group is shared -> split by height)
    zs = sorted(v.co.z for v in bm.verts); zmax = zs[-1]
    for f in bm.faces:
        if f in drop: continue
        cz = f.calc_center_median().z
        reg = {0: "jacket", 1: "pants", 2: "boots"}[f.material_index]
        if reg == "jacket" and cz < zmax * 0.5: f.material_index = 1
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bm.to_mesh(cloth.data); bm.free()
    # modifier order: displace must come before the armature modifier
    cloth.modifiers.clear()
    dis = cloth.modifiers.new("inflate", "DISPLACE"); dis.strength = 0.014; dis.mid_level = 0.0; dis.direction = "NORMAL"
    am = cloth.modifiers.new("Armature", "ARMATURE"); am.object = arm
    # --- rigid accessories skinned 100% to one bone via vertex groups
    def accessory(obj, bone):
        vg = obj.vertex_groups.new(name=bone)
        vg.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
        mod = obj.modifiers.new("Armature", "ARMATURE"); mod.object = arm
        obj.parent = body.parent
    bpy.context.view_layer.update()
    def bonepos(n, t=0.0):
        b = arm.data.bones[n]
        return arm.matrix_world @ (b.head_local.lerp(b.tail_local, t))
    pel, sp3, hd = bonepos("pelvis"), bonepos("spine_03"), bonepos("Head")
    sp2 = bonepos("spine_02")
    acc = []
    # tool belt: ring + pouches
    belt = torus("Belt", 0.15, 0.022, (pel.x, pel.y, pel.z + 0.07), M("belt"), ccoll); belt.scale = (1.0, 0.7, 1.0)
    acc.append((belt, "pelvis"))
    for i, a in enumerate((20, 70, 160, 200, 290)):
        r = math.radians(a)
        p = box(f"Pouch{i}", (0.06, 0.05, 0.08), (pel.x + math.cos(r) * 0.15, pel.y + math.sin(r) * 0.11, pel.z + 0.02), M("belt") if i % 2 else M("boots"), ccoll, 0.01)
        p.rotation_euler = (0, 0, r); acc.append((p, "pelvis"))
    # shoulder kit (left shoulder): box + lens + antenna
    sh = bonepos("upperarm_l", 0.15)
    kit = box("ShoulderKit", (0.1, 0.12, 0.07), (sh.x, sh.y, sh.z + 0.075), M("steel2"), ccoll, 0.015); acc.append((kit, "upperarm_l"))
    lens = cyl("KitLens", 0.025, 0.02, (sh.x, sh.y - 0.07, sh.z + 0.075), M("cyan"), ccoll, rot=(math.radians(90), 0, 0)); acc.append((lens, "upperarm_l"))
    ant = cyl("KitAntenna", 0.006, 0.16, (sh.x, sh.y + 0.03, sh.z + 0.16), M("silver"), ccoll); acc.append((ant, "upperarm_l"))
    tip = sphere("KitTip", 0.014, (sh.x, sh.y + 0.03, sh.z + 0.24), M("amber"), ccoll); acc.append((tip, "upperarm_l"))
    # fictional ID badge + lanyard on chest (no organisation branding: just a cyan stripe and generic glyph bars)
    # (facing is determined later; we place it on the -Y side, glTF characters face -Y after import)
    ch = bonepos("spine_03", 0.35)
    badge = box("IDBadge", (0.07, 0.006, 0.1), (ch.x - 0.02, ch.y - 0.115, ch.z - 0.1), M("paper"), ccoll, 0.004); acc.append((badge, "spine_03"))
    stripe = box("IDStripe", (0.07, 0.008, 0.02), (ch.x - 0.02, ch.y - 0.118, ch.z - 0.065), M("cyan"), ccoll, 0.0); acc.append((stripe, "spine_03"))
    photo = box("IDPhoto", (0.025, 0.008, 0.03), (ch.x - 0.035, ch.y - 0.118, ch.z - 0.11), M("steel2"), ccoll, 0.0); acc.append((photo, "spine_03"))
    for s in (-1, 1):
        l = box("Lanyard", (0.012, 0.008, 0.2), (ch.x - 0.02 + s * 0.045, ch.y - 0.105, ch.z + 0.0), M("cyan"), ccoll, 0.0, (0, math.radians(s * -14), 0)); acc.append((l, "spine_03"))
    # reflective jacket trim (cyan chest band) and collar
    band = torus("ChestBand", 0.165, 0.014, (sp2.x, sp2.y, sp2.z + 0.02), M("cyan"), ccoll); band.scale = (1.0, 0.72, 1.0); acc.append((band, "spine_02"))
    # cap with cyan band
    cap = sphere("Cap", 0.115, (hd.x, hd.y, hd.z + 0.1), M("steel"), ccoll, scale=(1.0, 1.05, 0.7)); acc.append((cap, "Head"))
    brim = box("CapBrim", (0.12, 0.09, 0.016), (hd.x, hd.y - 0.115, hd.z + 0.075), M("steel"), ccoll, 0.008); acc.append((brim, "Head"))
    cband = torus("CapBand", 0.112, 0.012, (hd.x, hd.y, hd.z + 0.085), M("cyan"), ccoll); cband.scale = (1.0, 1.05, 1.0); acc.append((cband, "Head"))
    for o, b in acc: accessory(o, b)
    # facing direction of the rest pose
    bpy.context.view_layer.update()
    ey = eyes[0] if eyes else body
    return arm, actions, body

def facing_yaw(arm_root, body):
    """Yaw (radians) so the character faces +X (= game grid +X) given the imported rest orientation."""
    eyes = next((o for o in bpy.data.objects if o.name == "Eyes"), None)
    head = bpy.data.objects.get("Armature").data.bones["Head"]
    arm = bpy.data.objects["Armature"]
    h = arm.matrix_world @ head.head_local
    e = eyes.matrix_world @ Vector((0, 0, 0)) if eyes else h
    # eyes object origin may sit at the world origin; use the bound-box centre instead
    if eyes:
        cs = [eyes.matrix_world @ Vector(c) for c in eyes.bound_box]
        e = sum(cs, Vector()) / 8
    f = Vector((e.x - h.x, e.y - h.y, 0))
    return math.atan2(f.y, f.x), f

# ---------------------------------------------------------------------------------------- main ----
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for n in ("Rooms", "Walls", "Floors", "Props", "Characters", "Creatures", "Effects", "Lighting", "Camera"):
        get_collection(n)
    ia.import_all()
    build_env_extras()
    build_doors()
    build_all_props()
    build_creatures()
    build_effects()
    build_tool_icons()
    arm, actions, body = build_character()
    # hide library collections from the view layer, keep them in the file
    def hide(lc):
        if lc.name.startswith("Library_") or lc.name.startswith("LIB."): lc.exclude = True
        for ch in lc.children: hide(ch)
    hide(bpy.context.view_layer.layer_collection)
    # original glTF materials/textures were replaced by the palette; drop dangling image references
    for img in list(bpy.data.images):
        if img.source == 'FILE' and not os.path.exists(bpy.path.abspath(img.filepath)):
            bpy.data.images.remove(img)
    bpy.data.orphans_purge(do_recursive=True)
    setup_lighting(VENDOR / "polyhaven/blue_photo_studio_1k.hdr")
    setup_render(256, 256)
    setup_camera(256, 256, (0.5, 0.5))
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), compress=True)
    log("saved", BLEND_PATH)

if __name__ == "__main__":
    main()
