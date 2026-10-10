"""Render the sprite catalogue (sprite_jobs.py) from ledgerlock_facility.blend into blender/renders-raw/.

  blender -b blender/source/ledgerlock_facility.blend -P blender/scripts/render_sprites.py -- [--only a,b] [--group g] [--list]

Output: blender/renders-raw/<group>/<name>.png + blender/renders-raw/meta.jsonl (consumed by pack_atlas.py).
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *
import sprite_jobs

def argv():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opts = {"only": None, "group": None, "list": False, "force": False}
    i = 0
    while i < len(a):
        if a[i] == "--only": opts["only"] = set(a[i + 1].split(",")); i += 1
        elif a[i] == "--group": opts["group"] = a[i + 1]; i += 1
        elif a[i] == "--list": opts["list"] = True
        elif a[i] == "--force": opts["force"] = True
        i += 1
    return opts

def lc_find(lc, name):
    if lc.name == name: return lc
    for c in lc.children:
        r = lc_find(c, name)
        if r: return r

def clear_stage():
    st = get_collection("Stage")
    for o in list(st.objects): bpy.data.objects.remove(o, do_unlink=True)
    return st

def stage_assembly(job):
    st = clear_stage()
    for p in job["parts"]:
        coll = bpy.data.collections.get("LIB." + p["lib"])
        if coll is None:
            raise RuntimeError(f"missing library item {p['lib']} for {job['name']}")
        inst = bpy.data.objects.new(job["name"] + "." + p["lib"], None)
        inst.instance_type = "COLLECTION"; inst.instance_collection = coll
        inst.location = p["at"]; inst.rotation_euler = (0, 0, math.radians(p["rz"]))
        s = p["s"]; inst.scale = (s, s, p["sz"] if p["sz"] is not None else s)
        st.objects.link(inst)

def set_char_visible(on):
    for n in ("Library_quaternius-universal-base-characters", "LIB.char_engineer"):
        lc = lc_find(bpy.context.view_layer.layer_collection, n)
        if lc: lc.exclude = not on

def facing_correction():
    arm = bpy.data.objects["Armature"]
    eyes = bpy.data.objects.get("Eyes")
    h = arm.matrix_world @ arm.data.bones["Head"].head_local
    cs = [eyes.matrix_world @ Vector(c) for c in eyes.bound_box]
    e = sum(cs, Vector()) / 8
    return math.atan2(e.y - h.y, e.x - h.x)

def main():
    o = argv()
    jobs = sprite_jobs.JOBS
    if o["only"]: jobs = [j for j in jobs if j["name"] in o["only"]]
    if o["group"]: jobs = [j for j in jobs if j["group"] == o["group"]]
    if o["list"]:
        for j in jobs: print(j["group"], j["name"])
        return
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    meta_path = RAW_DIR / "meta.jsonl"
    done = {}
    if meta_path.exists():
        for line in meta_path.read_text().splitlines():
            if line.strip():
                m = json.loads(line); done[m["name"]] = m
    setup_lighting(VENDOR / "polyhaven/blue_photo_studio_1k.hdr")
    catcher = add_shadow_catcher(8.0)
    bpy.context.scene.collection.objects.unlink(catcher) if False else None
    char_jobs = [j for j in jobs if j["kind"] == "char"]
    yaw0 = None
    if char_jobs:
        set_char_visible(True)
        yaw0 = facing_correction()
        log("character native facing (rad)", yaw0)
        for j in bpy.data.objects: pass
    cur_action = None
    for j in jobs:
        out = RAW_DIR / j["group"] / (j["name"] + ".png")
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists() and not o["force"] and j["name"] in done and not o["only"]:
            continue
        w, h = j["canvas"]
        setup_render(w, h, denoise=not j["shadow"], samples=(SAMPLES if j["shadow"] else 24))
        px, py = j["pivot"]
        cam = setup_camera(w, h, (px / w, py / h))
        cam.data.ortho_scale = max(w, h) / (PX_PER_M * j["zoom"])
        catcher.hide_render = not j["shadow"]
        if j["kind"] == "assembly":
            set_char_visible(False)
            stage_assembly(j)
        else:
            clear_stage()
            set_char_visible(True)
            arm = bpy.data.objects["Armature"]
            root = bpy.data.objects["char_engineer"]
            ad = arm.animation_data_create()
            act = bpy.data.actions[j["action"]]
            if ad.action != act:
                ad.action = act
                try: ad.action_slot = act.slots[0]
                except Exception: pass
            bpy.context.scene.frame_set(int(j["frame"]))
            root.rotation_euler = (0, 0, math.radians(j["yaw"]) - yaw0)
            root.scale = (1.06, 1.06, 1.06)
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        uses = sorted({p["lib"] for p in j["parts"]}) if j["parts"] else ["char_engineer", "anim_ual1"]
        meta = dict(name=j["name"], group=j["group"], canvas=[w, h], pivot=[px, py], uses=uses, file=str(out.relative_to(RAW_DIR)))
        done[j["name"]] = meta
        meta_path.write_text("\n".join(json.dumps(v) for v in done.values()) + "\n")
        log("rendered", j["name"])

if __name__ == "__main__":
    main()
