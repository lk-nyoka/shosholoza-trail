export type Coordinate = [number, number];
type Tags = Record<string, string>;
export type Element = { type: string; id: number; lon?: number; lat?: number; nodes?: number[]; geometry?: { lon: number; lat: number }[]; tags?: Tags };
export type Track = { id: number; nodes: number[]; coordinates: Coordinate[]; tags: Tags; railClass: string; active: boolean };
export type GraphNode = { id: string; osmId: number; coordinate: Coordinate; kind: string };
export type Edge = { id: string; from: string; to: string; way: number; length: number; cost: number; railClass: string };
export type Graph = { nodes: Record<string, GraphNode>; edges: Edge[]; adjacency: Record<string, number[]> };
export function distance(a: Coordinate, b: Coordinate) {
  const r = Math.PI / 180;
  const h = Math.sin((b[1]-a[1])*r/2)**2 + Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin((b[0]-a[0])*r/2)**2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function parseRail(elements: Element[]) {
  const tracks: Track[] = [];
  const controls = elements.filter(e => e.type === 'node' && e.tags?.railway);
  for (const e of elements) {
    if (e.type !== 'way' || !['rail','narrow_gauge','disused','abandoned'].includes(e.tags?.railway ?? '')) continue;
    if (!e.nodes || !e.geometry || e.nodes.length < 2 || e.nodes.length !== e.geometry.length) throw Error(`Invalid topology on OSM way ${e.id}`);
    const coordinates: Coordinate[] = e.geometry.map(p => {
      if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat) || Math.abs(p.lon)>180 || Math.abs(p.lat)>90) throw Error(`Invalid coordinate on ${e.id}`);
      return [p.lon,p.lat];
    });
    const tags = e.tags ?? {};
    const active = !['disused','abandoned'].includes(tags.railway) && !['yes','true'].includes(tags.disused) && !tags['disused:railway'] && !tags['abandoned:railway'];
    tracks.push({ id:e.id, nodes:e.nodes, coordinates, tags, railClass:tags.service || (tags.railway==='rail'?'main':'unknown'), active });
  }
  return { tracks, controls };
}
export function buildGraph(tracks: Track[], controls: Element[]): Graph {
  const graph: Graph = { nodes:{}, edges:[], adjacency:{} };
  const kinds = new Map(controls.map(e => [e.id,e.tags?.railway ?? 'track']));
  const costs: Record<string,number> = {main:1,crossover:1.08,yard:1.8,siding:2.4,spur:4,unknown:1.6};
  for (const track of tracks) {
    if (!track.active || ['no','private'].includes(track.tags.access)) continue;
    const ids = track.nodes.map((id,index) => {
      // Flat crossings have no route transfer: each OSM way retains its own lane.
      const key = kinds.get(id)==='railway_crossing' ? `n-${id}:w-${track.id}` : `n-${id}`;
      const previous = graph.nodes[key];
      if (previous && distance(previous.coordinate,track.coordinates[index])>.1) throw Error(`Conflicting OSM node ${id}`);
      graph.nodes[key] = { id:key,osmId:id,coordinate:track.coordinates[index],kind:kinds.get(id)??'track' };
      graph.adjacency[key] ??= [];
      return key;
    });
    for (let i=1;i<ids.length;i++) {
      if (ids[i]===ids[i-1]) continue;
      const length=distance(track.coordinates[i-1],track.coordinates[i]);
      if(length<=0) continue;
      const edge: Edge = {id:`w-${track.id}:${i-1}`,from:ids[i-1],to:ids[i],way:track.id,length,cost:length*(costs[track.railClass]??1.6),railClass:track.railClass};
      const index=graph.edges.push(edge)-1;
      graph.adjacency[edge.from].push(index);graph.adjacency[edge.to].push(index);
    }
  }
  return graph;
}
export function shortestPaths(graph: Graph, origin: string) {
  if(!graph.nodes[origin]) throw Error('Unknown route origin');
  const costs: Record<string,number> = {[origin]:0};
  const previous: Record<string,{node:string;edge:number}> = {};
  const pending=new Set([origin]);
  while(pending.size) {
    let current='';let minimum=Infinity;
    for(const id of pending) if(costs[id]<minimum){current=id;minimum=costs[id];}
    pending.delete(current);
    for(const index of graph.adjacency[current]) {
      const edge=graph.edges[index],next=edge.from===current?edge.to:edge.from;
      const cost=minimum+edge.cost;
      if(cost<(costs[next]??Infinity)){costs[next]=cost;previous[next]={node:current,edge:index};pending.add(next);}
    }
  }
  return { costs, previous };
}
