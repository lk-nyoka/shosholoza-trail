# WebGL Scene Notes

The map renderer uses Three.js and includes:

- PBR `MeshStandardMaterial` train, rail, sleeper, vegetation, and terrain materials.
- Soft shadow mapping from a directional sun light.
- `GLTFLoader` for `/assets/train.glb`.
- `KTX2Loader` for `/assets/terrain.ktx2`.
- `RGBELoader` for `/assets/shosholoza.hdr`.
- `InstancedMesh` sleepers and grass to reduce draw calls.
- `THREE.LOD` terrain with dense near geometry and simplified far geometry.
- `frustumCulled = true` on instanced and loaded objects.
- Esri World Imagery tile mosaic for the southern Africa ground surface.
- AWS Terrain-RGB/Terrarium tile mosaic decoded into near-terrain vertex displacement.
- Procedural atmospheric sky scattering with HDRI environment replacement when available.
- Instanced power poles and trees placed along the sampled OSM rail corridor.
- Geographic rail geometry sampled into a smooth 3D corridor.
- Projected clickable city labels.
- GPS-driven train position from `useGpsTelemetry`, including speed, accuracy, nearest station, and stale-signal handling.

The GLB, KTX2, and HDR files are optional. Until supplied, the app uses the procedural train and terrain materials. The Basis decoder files are already copied to `public/basis`.

The live satellite and elevation requests are also optional. They are loaded from public tile endpoints at runtime and fall back silently when offline or blocked by a network policy. Esri imagery should retain its required attribution if the production map is distributed publicly.

## Supplying assets

Place these files in `public/assets`:

- `train.glb`: centered on its rail axis, forward direction aligned to +Z, meters as units.
- `terrain.ktx2`: sRGB Basis/KTX2 terrain texture.
- `shosholoza.hdr`: equirectangular HDR environment map.

The loader failure handlers intentionally preserve the scene when any optional file is absent.

## Browser requirement

Enable hardware acceleration and WebGL in the browser. In Chrome or Edge:

1. Open Settings > System and enable `Use graphics acceleration when available`.
2. Restart the browser.
3. Visit `chrome://gpu` and confirm WebGL is hardware accelerated.
4. Reload `/app`.

If WebGL is disabled or sandboxed, `/app` shows an animated corridor preview instead of a blank page.
