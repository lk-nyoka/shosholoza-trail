// Adapted from supplied train-tourism/ui/PoiLabels: project real coordinates,
// cull behind-camera candidates, and keep DOM labels accessible.
import { Object3D, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import type { Place } from './Waypoints.ts';
export function projectWindowPlace(anchor: Vector3, camera: PerspectiveCamera, width: number, height: number) {
  const distance = anchor.distanceTo(camera.position);
  const ndc = anchor.clone().project(camera);
  if (distance > 1400 || ndc.z < -1 || ndc.z > 1 || Math.abs(ndc.x) > .82 || Math.abs(ndc.y) > .8) return null;
  const x = (ndc.x + 1) * width / 2, y = (1 - ndc.y) * height / 2;
  // Reserve the title and lower controls, including mobile window controls.
  if (y < Math.min(300, height * .34) || y > height - 260) return null;
  return { x, y, distance };
}
export function windowPlaceOccluded(ray: Raycaster, cameraPosition: Vector3, anchor: Vector3, obstacles: Object3D[]) {
  ray.set(cameraPosition, anchor.clone().sub(cameraPosition).normalize());
  ray.near = .3; ray.far = Math.max(.3, anchor.distanceTo(cameraPosition) - 8);
  return obstacles.some(object => ray.intersectObject(object, true).length > 0);
}
export function createWindowPlaces(host: HTMLElement, places: Place[], project: (lon: number, lat: number) => Vector3, select: (place: Place) => void, obstacles: Object3D[] = []) {
  const layer = document.createElement('div'); layer.className = 'window-places'; layer.setAttribute('aria-label', 'Mapped places through the window'); layer.hidden = true; host.append(layer);
  const ray = new Raycaster();
  let lastOcclusion = -Infinity;
  const entries = places.map(place => {
    const button = document.createElement('button'); button.type = 'button'; button.hidden = true;
    button.onclick = () => select(place);
    const name = document.createElement('strong'), detail = document.createElement('small'); name.textContent = place.name; button.append(name, detail); layer.append(button);
    const anchor = project(place.lon, place.lat); anchor.y += 12;
    return { place, button, detail, anchor, occluded: false };
  });
  return {
    update(camera: PerspectiveCamera, visible: boolean) {
      layer.hidden = !visible;
      if (!visible) return;
      camera.updateMatrixWorld();
      const now = performance.now(), checkOcclusion = now - lastOcclusion > 250;
      if (checkOcclusion) lastOcclusion = now;
      const hostRect = host.getBoundingClientRect();
      const blockers = Array.from(host.parentElement?.querySelectorAll<HTMLElement>('.animation-title,.animation-controls,.animation-saved,.station-visit') ?? []).filter(el => el.offsetWidth > 0).map(el => el.getBoundingClientRect());
      const selected: {x:number;y:number}[] = [];
      const candidates = entries.map(entry => ({entry, point: projectWindowPlace(entry.anchor, camera, host.clientWidth, host.clientHeight)})).sort((a,b)=>(a.point?.distance ?? Infinity)-(b.point?.distance ?? Infinity));
      for (const {entry,point} of candidates) {
        if (point && checkOcclusion) {
          entry.occluded = windowPlaceOccluded(ray, camera.position, entry.anchor, obstacles);
        }
        const overlapsUI = point && blockers.some(rect => point.x + hostRect.left + 100 > rect.left && point.x + hostRect.left - 100 < rect.right && point.y + hostRect.top > rect.top && point.y + hostRect.top - 65 < rect.bottom);
        const show = point && !entry.occluded && !overlapsUI && selected.length < 3 && !selected.some(p => Math.abs(p.x-point.x)<210 && Math.abs(p.y-point.y)<75);
        entry.button.hidden = !show;
        if (!show || !point) continue;
        selected.push(point); entry.button.style.transform = `translate(${point.x}px,${point.y}px) translate(-50%,-100%)`;
        entry.detail.textContent = `${Math.round(point.distance)} m away / mapped location`;
      }
    },
    dispose() { layer.remove(); },
  };
}
