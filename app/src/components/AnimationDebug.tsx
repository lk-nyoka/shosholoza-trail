// Developer overlay for the 3D animation, at ?debug=true.
//
// The plan asks for this explicitly, and asks that it not be removed after
// development: inspecting one system without waiting for the train to travel
// the whole route is the difference between a ten-second check and a two-minute
// one. It reads the scene through globalThis.__railScene, which RailScene
// publishes for exactly this purpose.
import { useEffect, useState } from 'react';
import type { LandmarkDefinition } from '../animation/JourneyDirector';
import { TIME_ORDER, TIME_PRESETS, type TimeKey } from '../animation/TimeOfDay';

type SceneHandle = {
  camera: { position: { x: number; y: number; z: number }; fov: number };
  renderer: { info: { render: { calls: number; triangles: number } } };
  trains: { position: { x: number; y: number; z: number } }[];
};

export type DebugControls = {
  seek(metres: number): void;
  view(value: 'side' | 'follow' | 'wide'): void;
  playLandmark(id: string): void;
  skipLandmark(): void;
  setTime(key: TimeKey): void;
};

export function useDebugMode() {
  const [on] = useState(() => new URLSearchParams(window.location.search).get('debug') === 'true');
  return on;
}

const round = (value: number) => Math.round(value * 10) / 10;

export function AnimationDebug({ distance, fps, mode, landmark, landmarks, controls }: {
  distance: number;
  fps: number;
  mode: string;
  landmark: LandmarkDefinition | null;
  landmarks: LandmarkDefinition[];
  controls: DebugControls;
}) {
  const [stats, setStats] = useState({ calls: 0, triangles: 0, camera: '', fov: 0, train: '' });

  useEffect(() => {
    const timer = setInterval(() => {
      const scene = (globalThis as unknown as { __railScene?: SceneHandle }).__railScene;
      if (!scene) return;
      const c = scene.camera.position, t = scene.trains[0]?.position;
      setStats({
        calls: scene.renderer.info.render.calls,
        triangles: scene.renderer.info.render.triangles,
        camera: `${round(c.x)}, ${round(c.y)}, ${round(c.z)}`,
        fov: round(scene.camera.fov),
        train: t ? `${round(t.x)}, ${round(t.y)}, ${round(t.z)}` : '-',
      });
    }, 250);
    return () => clearInterval(timer);
  }, []);

  return <aside className="animation-debug" aria-label="Developer panel">
    <h2>Debug</h2>
    <dl>
      <div><dt>fps</dt><dd data-warn={fps > 0 && fps < 30}>{fps}</dd></div>
      <div><dt>draw calls</dt><dd data-warn={stats.calls > 400}>{stats.calls}</dd></div>
      <div><dt>triangles</dt><dd>{(stats.triangles / 1000).toFixed(0)}k</dd></div>
      <div><dt>route</dt><dd>{round(distance)} m · {((distance / 5000) * 100).toFixed(1)}%</dd></div>
      <div><dt>camera mode</dt><dd>{mode}</dd></div>
      <div><dt>camera</dt><dd>{stats.camera}</dd></div>
      <div><dt>fov</dt><dd>{stats.fov}°</dd></div>
      <div><dt>train</dt><dd>{stats.train}</dd></div>
      <div><dt>landmark</dt><dd>{landmark?.name ?? '—'}</dd></div>
    </dl>
    <div className="animation-debug-actions">
      <button onClick={() => controls.view('side')}>Side</button>
      <button onClick={() => controls.view('follow')}>Follow</button>
      <button onClick={() => controls.view('wide')}>Wide</button>
    </div>
    <div className="animation-debug-actions">
      {TIME_ORDER.map(key => <button key={key} onClick={() => controls.setTime(key)}>{TIME_PRESETS[key].label}</button>)}
    </div>
    <div className="animation-debug-actions">
      {landmarks.map(item => <button key={item.id} onClick={() => controls.playLandmark(item.id)}>▶ {item.name}</button>)}
      <button onClick={() => controls.skipLandmark()}>Skip</button>
    </div>
    <div className="animation-debug-actions">
      {[0, 250, 1000, 2500, 5000].map(metres =>
        <button key={metres} onClick={() => controls.seek(metres)}>{metres === 0 ? 'Start' : `${metres} m`}</button>)}
    </div>
    <small>?debug=true · teleport along the route, replay a landmark, or switch rigs without waiting for the journey.</small>
  </aside>;
}
