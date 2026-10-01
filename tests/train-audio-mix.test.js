import assert from "node:assert/strict";
import { computeTrainAudioMix } from "../app/src/audio/train-pack/mix.ts";

const base = {
  speedKph: 0,
  accelerationMps2: 0,
  brakeIntensity: 0,
  cameraMode: "FOLLOW",
  cameraDistanceM: 10,
  environment: "OPEN",
  atStation: false,
  masterVolume: 1,
};

const stopped = computeTrainAudioMix(base);
const cruise = computeTrainAudioMix({ ...base, speedKph: 100 });
assert(cruise.windVolume > stopped.windVolume, "wind should increase with speed");
assert(cruise.rumbleVolume > stopped.rumbleVolume, "rumble should increase with speed");
assert(stopped.idleVolume > cruise.idleVolume, "idle layer should fade as speed rises");

const follow = computeTrainAudioMix({ ...base, speedKph: 80, cameraMode: "FOLLOW" });
const cinematic = computeTrainAudioMix({ ...base, speedKph: 80, cameraMode: "CINEMATIC" });
assert(cinematic.engineVolume < follow.engineVolume, "cinematic camera should push train into background");
assert(cinematic.rumbleVolume < follow.rumbleVolume, "cinematic camera should reduce train rumble");

const near = computeTrainAudioMix({ ...base, speedKph: 80, cameraDistanceM: 8 });
const far = computeTrainAudioMix({ ...base, speedKph: 80, cameraDistanceM: 120 });
assert(far.engineVolume < near.engineVolume, "engine should attenuate with camera distance");

const bridge = computeTrainAudioMix({ ...base, speedKph: 80, environment: "BRIDGE" });
const tunnel = computeTrainAudioMix({ ...base, speedKph: 80, environment: "TUNNEL" });
assert(bridge.bridgeVolume > 0, "bridge zone should add bridge resonance");
assert.equal(tunnel.bridgeVolume, 0, "tunnel should not add bridge resonance");
assert(tunnel.tunnelWet > 0, "tunnel should enable reverb send");
assert.equal(follow.tunnelWet, 0, "open track should have no tunnel reverb");

const station = computeTrainAudioMix({ ...base, speedKph: 30, atStation: true, environment: "STATION" });
const open30 = computeTrainAudioMix({ ...base, speedKph: 30 });
assert(station.windVolume < open30.windVolume, "station should reduce wind");

for (const mix of [stopped, cruise, follow, cinematic, near, far, bridge, tunnel, station]) {
  for (const [key, value] of Object.entries(mix)) {
    assert(Number.isFinite(value), `${key} should be finite`);
    if (key.endsWith("Volume") || key === "masterGain" || key === "tunnelWet") {
      assert(value >= 0 && value <= 1, `${key} should be in [0, 1]`);
    }
  }
}

console.log("mix tests: PASS");
