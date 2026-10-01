"""Generate real Depth Anything V2 Small relative-depth assets locally.

Install requirements in an isolated environment, then run from any directory.
First run downloads the public Apache-2.0 model; subsequent runs can be offline.
No hosted inference, API key, or synthetic/painted depth fallback is used.
"""
from pathlib import Path
import argparse
import hashlib
import json
import time

import numpy as np
from PIL import Image
import torch
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

MODEL = "depth-anything/Depth-Anything-V2-Small-hf"
REVISION = "5426e4f0f36572d16453bbda7a8389317b1bef99"
ROOT = Path(__file__).resolve().parents[2]
PHOTOS = ROOT / "public/assets/photos"
PRIORITY = ["kimberley", "matjiesfontein", "beaufort-west"]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--max-edge", type=int, default=1024)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    torch.manual_seed(0)
    processor = AutoImageProcessor.from_pretrained(
        MODEL, revision=REVISION, local_files_only=args.offline, use_fast=False
    )
    model = AutoModelForDepthEstimation.from_pretrained(
        MODEL, revision=REVISION, local_files_only=args.offline,
        use_safetensors=True
    ).eval()
    photos = sorted(PHOTOS.glob("*.webp"), key=lambda p: (
        PRIORITY.index(p.stem) if p.stem in PRIORITY else len(PRIORITY), p.name
    ))
    manifest = {"model": MODEL, "revision": REVISION, "license": "Apache-2.0",
                "method": "local CPU relative inverse depth; per-image min/max normalized",
                "encoding": "8-bit grayscale, white=near, black=far; not metric distance",
                "sources": ["https://github.com/DepthAnything/Depth-Anything-V2",
                            "https://huggingface.co/" + MODEL], "assets": []}
    for path in photos:
        if path.stem.endswith("-depth"):
            continue
        started = time.monotonic()
        photo = Image.open(path).convert("RGB")
        inputs = processor(images=photo, return_tensors="pt")
        with torch.inference_mode():
            prediction = model(**inputs).predicted_depth
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1), size=(photo.height, photo.width),
                mode="bicubic", align_corners=False
            ).squeeze().cpu().numpy()
        low, high = float(prediction.min()), float(prediction.max())
        if not np.isfinite(prediction).all() or high - low < 1e-6:
            raise RuntimeError(f"Invalid model depth for {path.name}")
        grayscale = np.rint((prediction - low) / (high - low) * 255).astype(np.uint8)
        depth = Image.fromarray(grayscale)
        depth.thumbnail((args.max_edge, args.max_edge), Image.Resampling.LANCZOS)
        target = path.with_name(path.stem + "-depth.webp")
        depth.save(target, "WEBP", quality=88, method=6)
        record = {"photo": path.name, "depth": target.name,
                  "width": depth.width, "height": depth.height,
                  "bytes": target.stat().st_size, "photo_sha256": digest(path),
                  "depth_sha256": digest(target),
                  "raw_range": [round(low, 6), round(high, 6)]}
        manifest["assets"].append(record)
        print(f"{target.name}: {depth.width}x{depth.height}, {record['bytes']} bytes, "
              f"{time.monotonic() - started:.1f}s", flush=True)
    (Path(__file__).parent / "depth-assets.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
