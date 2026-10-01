import * as THREE from 'three';

const places = [
  { id: 'platform', title: 'Platform & train', anchor: [0, 5.8, 0], text: 'Look along the platforms at the arriving electric train. The vehicles use the project’s existing Quaternius models; the station layout and livery are an illustrative study.' },
  { id: 'concourse', title: 'Station concourse', anchor: [185, 14, 0], text: 'Explore the elevated concourse, platform stairs and forecourt exit. This architecture is an approximation, not a surveyed station model or an accessibility guide.' },
  { id: 'street', title: 'City streets', anchor: [25, 4, 78], text: 'Explore podium shopfronts, pavements and moving traffic. Streets and buildings are authored around the animation, rather than traced from real Johannesburg footprints.' },
  { id: 'skyline', title: 'Johannesburg skyline study', anchor: [-70, 115, 240], text: 'The project’s local Johannesburg photograph guides the mix of slab towers, stepped roofs and lower buildings. Individual buildings are unnamed approximations. No live satellite imagery is loaded.' },
] as const;

/** Accessible DOM labels projected from local scene points; no extra draw calls. */
export function createCityExplorer(host: HTMLElement, select: (id: string) => void) {
  const layer = document.createElement('div'); layer.className = 'city-explorer'; host.append(layer);
  const panel = document.createElement('section'); panel.className = 'city-place-card'; panel.hidden = true; panel.setAttribute('aria-label', 'About this view');
  const title = document.createElement('h2'), body = document.createElement('p'), close = document.createElement('button');
  close.textContent = 'Close details'; panel.append(title, body, close); host.append(panel);
  let active = '', showMarkers = true;
  const markers = places.map(place => {
    const button = document.createElement('button'); button.className = 'city-place-marker'; button.textContent = place.title; button.dataset.place = place.id;
    button.setAttribute('aria-label', `Explore ${place.title}`); button.onclick = () => { select(place.id); show(place.id); }; layer.append(button);
    return { place, button, position: new THREE.Vector3(...place.anchor) };
  });
  function show(id: string) {
    const place = places.find(p => p.id === id); if (!place) return;
    active = id; title.textContent = place.title; body.textContent = place.text; panel.hidden = false;
  }
  close.onclick = () => { panel.hidden = true; const button = document.getElementById(active); button?.focus(); };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !panel.hidden) close.click(); };
  host.addEventListener('keydown', escape);
  const projected = new THREE.Vector3();
  return {
    show,
    clear() { panel.hidden = true; },
    toggle() { showMarkers = !showMarkers; layer.hidden = !showMarkers; return showMarkers; },
    update(camera: THREE.Camera, width: number, height: number) {
      if (!showMarkers) return;
      camera.updateMatrixWorld();
      const used: { x: number; y: number }[] = [];
      for (const { position, button } of markers) {
        projected.copy(position).project(camera);
        const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
        const visible = projected.z > -1 && projected.z < 1 && x > 95 && x < width - 95 && y > 240 && y < height * .62 && !used.some(p => Math.abs(p.x - x) < 180 && Math.abs(p.y - y) < 46);
        button.hidden = !visible;
        if (visible) { used.push({ x, y }); button.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`; }
      }
    },
    dispose() { host.removeEventListener('keydown', escape); layer.remove(); panel.remove(); },
  };
}
