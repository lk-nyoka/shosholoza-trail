# Optional WebGL assets

The Three.js map will load these files when present and keeps the procedural fallback when they are absent:

- `train.glb`: the high-resolution train model, with baked ambient occlusion where available.
- `terrain.ktx2`: a Basis/KTX2-compatible sRGB terrain texture.
- `shosholoza.hdr`: an equirectangular HDR environment map for train reflections.

The Basis transcoder runtime is served from `/basis/` and is included in the repository.
