"""Render billboard impostor sprites for the ride world.

Games solve distant detail with impostors: a camera-facing textured quad that is
indistinguishable from geometry at range. These are the objects that make the
corridor read as the Karoo rather than an empty field.

Everything is built from primitives so the script stays short, diffable and
immune to Blender API drift. Output is orthographic, transparent, 512px PNG plus
a JSON manifest of real-world heights so the map can size them correctly.

Run headless:
    node scripts/run-blender.mjs build_impostors
"""

import json
import math
import os
import sys

import bpy
import mathutils

OUT_DIR = os.path.join("public", "assets", "sprites")
SIZE = 512

# Karoo palette. Linear-space floats, not sRGB hex.
C_TRUNK = (0.121, 0.093, 0.070, 1.0)
C_JACARANDA = (0.352, 0.211, 0.518, 1.0)
C_METAL = (0.297, 0.312, 0.330, 1.0)
C_GALV = (0.475, 0.492, 0.505, 1.0)
C_WOOD = (0.203, 0.145, 0.098, 1.0)
C_ALOE = (0.180, 0.286, 0.170, 1.0)
C_ALOE_FLOWER = (0.702, 0.243, 0.075, 1.0)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, colour, roughness=0.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = colour
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
    return mat


def put(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def cylinder(radius, depth, location, rotation=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    return bpy.context.object


def cube(scale, location, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.scale = scale
    return obj


def sphere(radius, location, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=radius, location=location)
    obj = bpy.context.object
    obj.scale = scale
    return obj


def cone(radius, depth, location, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=radius, depth=depth,
                                    location=location, rotation=rotation)
    return bpy.context.object


# --- props -----------------------------------------------------------------

def jacaranda(height=10.0):
    """Pretoria in one silhouette: dark trunk, wide purple canopy."""
    trunk_h = height * 0.42
    m_trunk, m_leaf = material("trunk", C_TRUNK), material("jacaranda", C_JACARANDA, 0.85)
    put(cylinder(height * 0.035, trunk_h, (0, 0, trunk_h / 2), verts=10), m_trunk)
    # Three limbs so the silhouette is not a lollipop.
    for angle in (0.5, 2.6, 4.6):
        put(cylinder(height * 0.018, height * 0.30,
                     (math.cos(angle) * height * 0.07, math.sin(angle) * height * 0.07, trunk_h + height * 0.10),
                     rotation=(math.radians(22) * math.cos(angle), math.radians(22) * math.sin(angle), 0), verts=8), m_trunk)
    canopy_z = trunk_h + height * 0.24
    # Many irregular clumps, not one ellipsoid: a smooth dome reads as a mushroom.
    clumps = ((0.00, 0.00, 0.26, 0.20), (0.22, 0.30, 0.20, 0.10), (-0.26, 0.14, 0.18, -0.04),
              (0.10, -0.28, 0.19, 0.06), (-0.18, -0.22, 0.16, 0.14), (0.30, -0.06, 0.15, -0.02),
              (-0.04, 0.26, 0.17, 0.18), (0.16, 0.08, 0.21, 0.24))
    for dx, dy, r, dz in clumps:
        put(sphere(height * r, (dx * height, dy * height, canopy_z + dz * height), (1.15, 1.1, 0.82)), m_leaf)


def windpump(height=8.0):
    """Southern Cross windmill - the most recognisable object in the interior."""
    m_metal, m_galv = material("metal", C_METAL, 0.55), material("galv", C_GALV, 0.45)
    tower_h = height * 0.74
    # Four splayed legs read as a lattice tower in silhouette.
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        base = height * 0.10
        put(cylinder(height * 0.012, tower_h * 1.02, (sx * base * 0.5, sy * base * 0.5, tower_h / 2),
                     rotation=(math.radians(-4.5) * sy, math.radians(4.5) * sx, 0), verts=6), m_metal)
    for level in (0.30, 0.55, 0.80):
        z = tower_h * level
        w = height * 0.10 * (1 - level * 0.7)
        put(cube((w * 2, height * 0.006, height * 0.006), (0, 0, z)), m_metal)
        put(cube((height * 0.006, w * 2, height * 0.006), (0, 0, z)), m_metal)
    hub_z = tower_h + height * 0.10
    put(cylinder(height * 0.022, height * 0.06, (0, 0, hub_z), rotation=(math.radians(90), 0, 0), verts=10), m_galv)
    # Multi-blade fan: the defining feature.
    for i in range(16):
        a = (i / 16) * math.tau
        put(cube((height * 0.018, height * 0.004, height * 0.115),
                 (math.cos(a) * height * 0.085, 0, hub_z + math.sin(a) * height * 0.085),
                 rotation=(0, -a, 0)), m_galv)
    put(cube((height * 0.005, height * 0.10, height * 0.075), (0, height * 0.13, hub_z)), m_galv)


def telegraph_pole(height=8.0):
    """One sprite repeated along the line reads instantly as railway."""
    m_wood, m_metal = material("wood", C_WOOD, 0.85), material("insul", C_GALV, 0.4)
    put(cylinder(height * 0.022, height, (0, 0, height / 2), verts=10), m_wood)
    for i, z in enumerate((height * 0.90, height * 0.78)):
        put(cube((height * 0.20, height * 0.012, height * 0.012), (0, 0, z)), m_wood)
        for sx in (-1, 1):
            put(cylinder(height * 0.008, height * 0.035, (sx * height * 0.085, 0, z + height * 0.022), verts=6), m_metal)


def aloe_ferox(height=2.0):
    """Karoo ground cover with an unmistakable flower spike."""
    m_leaf, m_flower = material("aloe", C_ALOE, 0.6), material("aloeflower", C_ALOE_FLOWER, 0.5)
    put(cylinder(height * 0.09, height * 0.42, (0, 0, height * 0.21), verts=10), material("stem", C_TRUNK))
    for i in range(11):
        a = (i / 11) * math.tau
        put(cone(height * 0.055, height * 0.46,
                 (math.cos(a) * height * 0.13, math.sin(a) * height * 0.13, height * 0.56),
                 rotation=(math.radians(52) * math.sin(a), math.radians(-52) * math.cos(a), 0)), m_leaf)
    put(cone(height * 0.05, height * 0.30, (0, 0, height * 0.86)), m_flower)


def street_lamp(height=6.0):
    m_metal = material("lamp", C_METAL, 0.4)
    put(cylinder(height * 0.018, height, (0, 0, height / 2), verts=10), m_metal)
    put(cube((height * 0.16, height * 0.012, height * 0.012), (height * 0.07, 0, height * 0.97)), m_metal)
    put(sphere(height * 0.035, (height * 0.15, 0, height * 0.95), (1, 1, 0.6)),
        material("bulb", (0.95, 0.88, 0.68, 1.0), 0.25))


PROPS = {
    "jacaranda_full": (jacaranda, 10.0),
    "windpump": (windpump, 8.0),
    "telegraph_pole": (telegraph_pole, 8.0),
    "aloe_ferox": (aloe_ferox, 2.0),
    "street_lamp": (street_lamp, 6.0),
}


# --- render ----------------------------------------------------------------

def setup_render(height):
    scene = bpy.context.scene
    # Transparent film is what makes these usable as billboards.
    scene.render.film_transparent = True
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 48

    # Golden-hour key light, matching the ride's default sun.
    bpy.ops.object.light_add(type="SUN", location=(6, -9, 12))
    sun = bpy.context.object
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(52), 0, math.radians(38))

    bpy.ops.object.light_add(type="SUN", location=(-8, 6, 7))
    fill = bpy.context.object
    fill.data.energy = 2.6
    fill.rotation_euler = (math.radians(64), 0, math.radians(-140))

    # Orthographic front view framed to the prop, so the sprite scales linearly
    # with real-world height on the map.
    bpy.ops.object.camera_add(location=(0, -30, height / 2))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = height * 1.12
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = cam


def render_prop(name, builder, height):
    clear()
    builder(height)
    setup_render(height)
    path = os.path.abspath(os.path.join(OUT_DIR, f"{name}.png"))
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return {"id": name, "file": f"/assets/sprites/{name}.png", "heightMetres": height}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    only = None
    if "--" in sys.argv:
        extra = sys.argv[sys.argv.index("--") + 1:]
        if extra:
            only = set(extra)

    out = os.path.abspath(os.path.join(OUT_DIR, "manifest.json"))

    # Merge, never replace. Re-rendering one prop must not drop the others from
    # the manifest - that silently removes them from the map.
    existing = {}
    if os.path.exists(out):
        try:
            with open(out, encoding="utf-8") as handle:
                for entry in json.load(handle).get("sprites", []):
                    existing[entry["id"]] = entry
        except (ValueError, KeyError, OSError):
            existing = {}

    for name, (builder, height) in PROPS.items():
        if only and name not in only:
            continue
        existing[name] = render_prop(name, builder, height)
        print(f"rendered {name} ({height} m)")

    manifest = [existing[name] for name in PROPS if name in existing]
    with open(out, "w", encoding="utf-8") as handle:
        json.dump({
            "generator": "assets/blender/build_impostors.py",
            "note": "Billboard impostors rendered from primitives. Orthographic, transparent, "
                    "sized by real-world height. Interpretive props, not photographs of specific objects.",
            "size": SIZE,
            "sprites": manifest,
        }, handle, indent=2)
    print(f"manifest: {out} ({len(manifest)} sprites)")


main()
