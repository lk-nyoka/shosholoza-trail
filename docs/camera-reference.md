# Pretoria follow camera

## Selected reference

Local `Repos/earth-drive-main/src/main.js`, manual mouse control (lines 271–295)
and chase-camera/ENU conversion (lines 413–480). MIT, copyright 2026 Vaibhav Rau;
full notice shipped at `/licenses/earth-drive-MIT.txt`.

Source behaviour: radius 14, elevation .32 radians, mouse sensitivity .005
radians per pixel, idle reset delay 1500 ms. When not dragging and past the
delay, angle takes the shortest rotation using atan2(sin(delta), cos(delta));
angle, elevation and radius each converge by .08 per frame. The Three.js camera
offset is spherical and converted to Cesium's east/north/up frame.

Compared local alternatives: Sketchbook CameraOperator follows by projecting
the camera onto a target-centred radius and has a separate orbit implementation;
its spring utilities are not its follow algorithm. Racing-game Vehicle.tsx
parents the chase camera to the car and applies steering/speed offsets and sway.
EarthDrive's explicit manual orbit and delayed return best fit this preview.

## Implementation

`app/src/camera/TrainFollowCamera.ts` owns portable smoothing/interaction state;
`CameraDirector.ts` owns its animation clock and sends poses to MapLibre.
`train-camera.ts` computes the geographic target from the existing railway.
The ride still owns train time and position. Presets stop the follow clock;
seeking resets it. Cleanup cancels its animation frame. Hidden tabs do not
apply camera poses; reduced motion applies targets without camera easing.

In the Pretoria preview choose **Follow the train**, then **Auto ride**. Drag the
world or use look buttons. Release: orbit holds for 1.5 seconds before returning
behind the train. Inspect at 2.5 km and on bends; the four existing presets remain
available for comparison. This is an adaptation, not visual-equivalence proof.

## Explicit changes from source

- MapLibre owns projection and terrain; `jumpTo` replaces Cesium setView/ECEF
  bridging. No unsupported Mapbox free-camera API. FOV stays MapLibre's existing
  value rather than claiming to match the source's Three.js projection.
- Radius 14 is car-scale. Train framing uses zoom 17.7, centre 100 m behind the
  locomotive, an 80 m route look-ahead for bearing, and pitch 71.67 degrees
  (90 degrees minus the source's .32-radian elevation). This frames a rake;
  it does not assert that 14 metres and zoom 17.7 are equivalent.
- `.08` per frame becomes `1 - .92^(dt*60)`, with dt capped at .1 seconds after
  stalls. It matches 60 Hz source damping and removes frame-rate dependence.
- Geographic centre also uses that damping to add controlled positional lag;
  EarthDrive's car-centred reference frame does not provide this lag itself.
- Existing ride drag sensitivity (.25 degrees/pixel horizontally, .12
  vertically), keyboard/look buttons and touch input are retained. Touch
  orbit in follow mode does not also step the train. No wheel-radius control.
- Reference imagery services, vehicle physics, camera sway and effects were
  not imported as part of this camera change.

Verification covers frame-rate equivalence, north crossing, held drag, delayed
return, reset on seek, reduced motion and browser interaction with actual route
data. User visual review remains the acceptance checkpoint.

The first live-imagery auto-ride capture timed out during a browser click. The
director now suppresses sub-pixel pose updates once settled to avoid repeatedly
invalidating tile/terrain renders. The targeted interaction test passed again
after this change. Live terrain startup and motion performance are not accepted
by these fixture-based tests; inspect them on the local preview separately.
