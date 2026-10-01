from pathlib import Path
import math
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "public" / "audio" / "train"
EXPECTED = {
    "idle_hum.wav": (7.5, 8.5),
    "rail_joint.wav": (0.20, 0.40),
    "brake_hiss.wav": (1.0, 1.7),
    "brake_squeal.wav": (1.2, 2.0),
    "horn.wav": (2.0, 3.0),
    "bridge_rumble.wav": (5.5, 6.5),
    "metal_clank.wav": (0.3, 0.7),
    "crossing_bell.wav": (0.7, 1.3),
}
LOOPS = {"idle_hum.wav", "bridge_rumble.wav"}

for name, (min_d, max_d) in EXPECTED.items():
    path = AUDIO / name
    assert path.exists(), f"missing {name}"
    with wave.open(str(path), "rb") as wf:
        assert wf.getframerate() == 48_000, f"{name}: expected 48 kHz"
        assert wf.getnchannels() == 1, f"{name}: expected mono"
        assert wf.getsampwidth() == 2, f"{name}: expected 16-bit PCM"
        frames = wf.getnframes()
        duration = frames / wf.getframerate()
        assert min_d <= duration <= max_d, f"{name}: unexpected duration {duration:.3f}s"
        y = np.frombuffer(wf.readframes(frames), dtype=np.int16).astype(np.float64) / 32768.0

    assert np.all(np.isfinite(y)), f"{name}: non-finite samples"
    peak = float(np.max(np.abs(y)))
    rms = float(np.sqrt(np.mean(y * y)))
    dc = abs(float(np.mean(y)))
    assert 0.01 < peak <= 0.93, f"{name}: suspicious peak {peak:.3f}"
    assert rms > 0.001, f"{name}: effectively silent"
    assert dc < 0.01, f"{name}: excessive DC offset {dc:.5f}"

    if name in LOOPS:
        seam = abs(float(y[-1] - y[0]))
        assert seam < 0.005, f"{name}: loop boundary likely clicks (seam={seam:.5f})"

    # One-shots should finish close to zero to avoid end clicks.
    if name not in LOOPS:
        tail_rms = float(np.sqrt(np.mean(y[-min(len(y), 480):] ** 2)))
        assert tail_rms < 0.04, f"{name}: tail too hot ({tail_rms:.4f})"

    print(f"{name}: PASS  duration={duration:.2f}s peak={peak:.3f} rms={rms:.3f}")

print("audio validation: PASS")
