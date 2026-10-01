# Offline photo depth generation

These assets use the **actual Depth Anything V2 Small** model locally. The Small
model is Apache-2.0; the larger model variants have different licenses and are not
used. Source photographs retain their original licenses and credits.

Official implementation: https://github.com/DepthAnything/Depth-Anything-V2

Model card: https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf

Create an isolated Python environment outside the repository, install
`torch==2.14.0` from https://download.pytorch.org/whl/cpu, then install this folder's
`requirements.txt`. Run `python scripts/depth/generate-depth.py` from the repository.
The first run downloads the public model weights without an account. Add
`--offline` after the weights are cached to run completely disconnected.

The model revision is pinned. `depth-assets.json` records input/output SHA-256
hashes, dimensions, sizes, and raw model ranges. Kimberley, Matjiesfontein, and
Beaufort West are generated first, then all remaining photos.

The output is **relative inverse depth**, not surveyed or metric geometry:
white is closer, black is farther. Each map uses the same aspect ratio as its
source photo, at a maximum 1024-pixel edge. Sample the image and its depth using
the same UV crop in the shader. All WebP color channels contain the grayscale
signal; sample `.r`. The output is only for subtle photo parallax.

No model weights, Python runtime, or inference library ships to the browser.
