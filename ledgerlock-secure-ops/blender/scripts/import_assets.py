"""Import the selected third-party assets (see blender/asset-selection.json) into named Library collections.

Each item becomes its own collection `LIB.<id>` (so sprite jobs can instance it) under a pack collection
`Library_<pack>`. MegaKit/Kenney materials are replaced by the finance-office palette (restyle).
Run standalone for a smoke test:  blender -b -P blender/scripts/import_assets.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

SELECTION = ROOT / "blender" / "asset-selection.json"

def load_selection():
    return json.loads(SELECTION.read_text())

def lib_collection(item_id, pack):
    parent = get_collection("Library_" + pack)
    return get_collection("LIB." + item_id, parent)

def import_all(only=None):
    sel = load_selection()
    out = {}
    for it in sel["items"]:
        pack = sel["packs"][it["pack"]]
        path = VENDOR / pack["dir"] / it["file"]
        if it["role"] in ("material", "animations", "character") or it["role"].startswith("lighting"):
            continue
        if only and it["id"] not in only:
            continue
        if not path.exists():
            log("MISSING", path)
            continue
        coll = lib_collection(it["id"], it["pack"])
        scale = it.get("scale", 1.0)
        root = import_gltf(path, coll, it["id"], scale=scale)
        out[it["id"]] = coll
        log("imported", it["id"], "from", path.name)
    return out

def import_character():
    """Returns (armature, [meshes], actions dict) for the base character with UAL animations retargeted by bone name."""
    sel = load_selection()
    cpack, apack = sel["packs"]["quaternius-universal-base-characters"], sel["packs"]["quaternius-universal-animation-library"]
    citem = next(i for i in sel["items"] if i["id"] == "char_engineer")
    aitem = next(i for i in sel["items"] if i["id"] == "anim_ual1")
    ccoll = get_collection("LIB.char_engineer", get_collection("Library_" + citem["pack"]))
    croot = import_gltf(VENDOR / cpack["dir"] / citem["file"], ccoll, "char_engineer", restyle=False)
    acoll = get_collection("LIB.anim_ual1", get_collection("Library_" + aitem["pack"]))
    aroot = import_gltf(VENDOR / apack["dir"] / aitem["file"], acoll, "anim_ual1", restyle=False)
    arm = next(o for o in ccoll.objects if o.type == "ARMATURE")
    meshes = [o for o in ccoll.objects if o.type == "MESH"]
    # donor armature/mesh from the animation file are not needed once the actions are in bpy.data.actions
    for o in list(acoll.objects):
        if o.type in ("MESH", "ARMATURE"):
            o.hide_render = True
    actions = {a.name: a for a in bpy.data.actions}
    return arm, meshes, actions, ccoll, acoll

if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    got = import_all()
    log("imported", len(got), "library items")
    arm, meshes, actions, *_ = import_character()
    log("character", arm.name, [m.name for m in meshes], "actions", len(actions))
