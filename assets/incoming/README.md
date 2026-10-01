# Drop zone — your exports land here

You work in Spline and Rive. Codex works in Blender and code. Neither waits for the other.

**Drop a file here and Codex picks it up on its next build. Until then it uses a coded
fallback, so nothing is ever blocked.**

---

## Rive - DROPPED, do not export

Rive needs a Rust toolchain that is not installed here, and the only authoring CLI is an
unofficial community tool. More importantly, re-authoring the same abstract motifs in a new
format would not fix the "generic" problem. **The hub scene animations are made in code with
depth-map parallax + GSAP instead.** Do not spend time in Rive.

---

## Spline → `assets/incoming/spline/`

For landmark props that are tedious to build in a script.

**Export:** `Export → GLTF/GLB` (binary `.glb`, not `.gltf` + folder)

**Useful props, in priority order:**
```
big-hole.glb          the crater depression at Kimberley
headgear.glb          Kimberley mine headgear
lord-milner.glb       the Matjiesfontein hotel façade
windpump.glb          Southern Cross windmill — reused all along the corridor
```

**Rules:**
- Model at **real-world metres**. A windpump is ~8 m tall, not 8 units.
- Origin at the **base centre**, sitting on Y=0, so it plants on the terrain correctly.
- Keep it under ~15k triangles each. These are seen at distance.
- Bake or keep materials simple — Codex re-exports through Blender for Draco compression.

**Never ship a Spline export straight into `public/`.** It goes through the Blender step for
compression and the triangle budget.

---

## Notes file

Drop a `notes.txt` beside anything unusual — which photo a scene is built on, anything you
want credited, anything unfinished. Codex reads it.

---

## What Codex does with these

1. Detects the file on its next build.
2. Rive: registers it, binds the state machine, replaces the coded scene for that hub.
3. Spline: re-exports through Blender headless with Draco, checks the triangle budget, places it
   in the world.
4. Adds it to the offline pack manifest and re-runs the gates.

If a file is malformed or the names do not match, Codex **falls back to the coded version and
logs why** — it will not silently ship something broken, and it will not stall.
