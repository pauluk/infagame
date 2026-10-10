"""Shared helpers for the LedgerLock Blender pipeline (run inside Blender, `blender -b -P ...`).

Conventions
-----------
* 1 game tile = TILE_M metres (1.5 m). Game grid +X = Blender +X, game grid +Y = Blender -Y.
* Camera: orthographic, azimuth 45 deg, elevation 30 deg -> ground tiles project to an exact 2:1 diamond.
* Sprites are rendered at RENDER_SCALE x the on-screen size (48x24 px per cell) for crisp zooming.
* Every sprite's ground "foot point" (tile centre, z=0) maps to a fixed pixel (pivot) of its canvas.
"""
import bpy, math, os, sys, json
from pathlib import Path
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "blender" / "source-assets" / "vendor"
BLEND_PATH = ROOT / "blender" / "source" / "ledgerlock_facility.blend"
RAW_DIR = ROOT / "blender" / "renders-raw"          # intermediate PNGs (git-ignored)

TILE_M = 1.2                          # one game cell = 1.2 m
TILE_PX = 48                          # on-screen cell width in the game (48 x 24 diamond)
MEGA_SCALE = TILE_M / 4.0            # MegaKit floor/wall modules are 4 m wide -> 1 cell
RENDER_SCALE = 2
PX_PER_M = TILE_PX / (TILE_M * math.sqrt(2)) * RENDER_SCALE   # 2:1 diamond, tile width 48 px at 1x
SAMPLES = int(os.environ.get("LL_SAMPLES", "40"))

PALETTE = {
    "navy": "#0B1424", "steel": "#1A2B43", "cyan": "#37D7D0", "blue": "#69A9FF", "mint": "#9DE3B1",
    "violet": "#A88BFF", "periwinkle": "#8C9DFF", "amber": "#FFC45E", "coral": "#FF7183", "white": "#F3F6FA",
    # supporting neutrals derived from the palette for lit surfaces
    "panel": "#8FA3BD", "panel_light": "#B4C2D6", "panel_mid": "#5B7190", "floor_a": "#8FA4C0", "floor_b": "#8197B5",
}

def srgb(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_rgba(h, a=1.0):
    h = PALETTE.get(h, h).lstrip("#")
    return (srgb(int(h[0:2], 16)), srgb(int(h[2:4], 16)), srgb(int(h[4:6], 16)), a)

_mats = {}
def pmat(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0):
    """Palette material (cached by name)."""
    if name in _mats and name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hex_rgba(color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
    if emit:
        b.inputs["Emission Color"].default_value = hex_rgba(emit)
        b.inputs["Emission Strength"].default_value = emit_strength
    _mats[name] = True
    return m

def emissive(name, color, strength=3.0):
    return pmat(name, color, rough=0.4, emit=color, emit_strength=strength)

# --- restyle map: original MegaKit material -> finance-office palette ---------------------------------
def restyle_material(old):
    n = old.name.split(".")[0]
    table = {
        "MI_Trim_01": lambda: pmat("LL_panel_mid", "panel_mid", 0.5, 0.1),
        "MI_Trim_02": lambda: pmat("LL_panel_light", "panel_light", 0.5, 0.1),
        "MI_Trim_02_Floor": lambda: pmat("LL_floor_a", "floor_a", 0.55, 0.05),
        "MI_Trim_03": lambda: pmat("LL_white", "#D9E2EE", 0.5, 0.0),
        "MI_Trim_03_Dark": lambda: pmat("LL_steel", "steel", 0.5, 0.12),
        "MI_Trim_03_Cables": lambda: pmat("LL_cables", "navy", 0.6, 0.0),
        "MI_Trim_03_Cables_Blue": lambda: emissive("LL_cable_glow", "cyan", 1.2),
        "MI_PaddedWall": lambda: pmat("LL_padded", "panel", 0.8, 0.0),
        "M_Black": lambda: pmat("LL_black", "navy", 0.35, 0.3),
        "M_Light": lambda: emissive("LL_light", "#EAF7FF", 6.0),
        "M_Decal_Screen": lambda: emissive("LL_screen", "cyan", 2.2),
        "M_Decal_White": lambda: pmat("LL_decal_white", "white", 0.6),
        "M_Glass": lambda: pmat("LL_glass", "blue", 0.1, 0.0, alpha=0.28),
        "M_LightFade_Red": lambda: emissive("LL_amber_light", "amber", 3.0),
        "MI_Decal_Red": lambda: pmat("LL_decal_amber", "amber", 0.5),
        "MI_Decal_Orange": lambda: pmat("LL_decal_amber", "amber", 0.5),
    }
    fn = table.get(n)
    return fn() if fn else pmat("LL_panel_mid", "panel_mid", 0.5, 0.1)

def restyle_object(obj):
    for slot in obj.material_slots:
        if slot.material:
            slot.material = restyle_material(slot.material)

# --- collections ------------------------------------------------------------------------------------
def get_collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c

def move_to_collection(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)

def set_active(obj):
    bpy.context.view_layer.objects.active = obj

def import_gltf(path, coll, name, scale=1.0, restyle=True, keep_armature=False):
    """Import a glTF/GLB into `coll`, parented under an empty called `name`. Returns the empty."""
    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [bpy.data.objects[k] for k in bpy.data.objects.keys() if k not in before]
    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    for o in new:
        if o.type == "MESH" and o.name.startswith("Icosphere") and not o.parent:
            bpy.data.objects.remove(o, do_unlink=True)        # glTF import helper blob in Quaternius rigs
            continue
        if o.parent is None:
            o.parent = root
        move_to_collection(o, coll)
        if restyle and o.type == "MESH":
            restyle_object(o)
    root.scale = (scale, scale, scale)
    return root

# --- render + camera --------------------------------------------------------------------------------
def setup_render(width, height, transparent=True, denoise=False, samples=None):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples or SAMPLES
    sc.cycles.use_denoising = denoise   # OIDN breaks shadow-catcher alpha, so only used for sprites without shadows
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transparent_max_bounces = 6
    sc.render.film_transparent = transparent
    sc.render.resolution_x = width
    sc.render.resolution_y = height
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.compression = 15
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = -0.55

def setup_camera(width, height, pivot=(0.5, 0.5), name="LL_Camera"):
    """Orthographic 2:1 camera; world origin lands on pixel (pivot_x*W, pivot_y*H)."""
    cam_data = bpy.data.cameras.get(name) or bpy.data.cameras.new(name)
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(width, height) / PX_PER_M
    big = float(max(width, height))
    cam_data.shift_x = (0.5 - pivot[0]) * (width / big)
    cam_data.shift_y = (pivot[1] - 0.5) * (height / big)
    cam_data.clip_start = 0.1
    cam_data.clip_end = 200
    cam = bpy.data.objects.get(name) or bpy.data.objects.new(name, cam_data)
    cam.data = cam_data
    if cam.name not in bpy.context.scene.collection.all_objects:
        get_collection("Camera").objects.link(cam)
    el, az = math.radians(30), math.radians(45)
    d = 60.0
    cam.location = Vector((math.cos(el) * math.sin(az) * d, -math.cos(el) * math.cos(az) * d, math.sin(el) * d))
    cam.rotation_euler = Euler((math.radians(60), 0, math.radians(45)), "XYZ")
    bpy.context.scene.camera = cam
    return cam

def setup_lighting(hdri=None, sun_energy=3.0):
    coll = get_collection("Lighting")
    for o in list(coll.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    sun_d = bpy.data.lights.new("LL_Sun", "SUN")
    sun_d.energy = sun_energy
    sun_d.angle = math.radians(14)           # soft baked shadows
    sun_d.color = (1.0, 0.97, 0.92)
    sun = bpy.data.objects.new("LL_Sun", sun_d)
    sun.rotation_euler = Euler((math.radians(48), math.radians(8), math.radians(-35)), "XYZ")   # light from upper left/back
    coll.objects.link(sun)
    fill_d = bpy.data.lights.new("LL_Fill", "AREA")
    fill_d.energy = 170
    fill_d.size = 6
    fill_d.color = (0.72, 0.85, 1.0)
    fill = bpy.data.objects.new("LL_Fill", fill_d)
    fill.location = (6, -6, 5)
    fill.rotation_euler = Euler((math.radians(60), 0, math.radians(45)), "XYZ")
    coll.objects.link(fill)
    w = bpy.context.scene.world or bpy.data.worlds.new("LL_World")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    if hdri and Path(hdri).exists():
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri), check_existing=True)
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.95
    else:
        bg.inputs["Color"].default_value = hex_rgba("#BCD0EA")
        bg.inputs["Strength"].default_value = 0.8
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

def add_shadow_catcher(size=8.0):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, -0.001))
    p = bpy.context.active_object
    p.name = "LL_ShadowCatcher"
    p.is_shadow_catcher = True
    return p

# --- primitive builders -----------------------------------------------------------------------------
def box(name, size, loc, mat, coll, bevel=0.015, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 2
    o.data.materials.append(mat)
    move_to_collection(o, coll)
    return o

def cyl(name, radius, depth, loc, mat, coll, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    move_to_collection(o, coll)
    bpy.ops.object.shade_smooth()
    return o

def sphere(name, radius, loc, mat, coll, scale=(1, 1, 1), seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.data.materials.append(mat)
    move_to_collection(o, coll)
    bpy.ops.object.shade_smooth()
    return o

def cone(name, r1, r2, depth, loc, mat, coll, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    move_to_collection(o, coll)
    return o

def torus(name, major, minor, loc, mat, coll, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot, major_segments=36, minor_segments=10)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    move_to_collection(o, coll)
    bpy.ops.object.shade_smooth()
    return o

def parent_all(objs, parent):
    for o in objs:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()

def new_group(name, coll):
    e = bpy.data.objects.new(name, None)
    coll.objects.link(e)
    return e

def log(*a):
    print("[ledgerlock]", *a, flush=True)
