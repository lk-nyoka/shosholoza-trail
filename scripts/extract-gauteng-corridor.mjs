import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sourceText = await readFile('data/route-ride.geojson', 'utf8');
const source = JSON.parse(sourceText);
const points = (source.features?.[0] ?? source).geometry.coordinates;
const anchor = [28.0423048, -26.1976708];
const radians = Math.PI / 180;
const metres = (a, b) => {
  const h = Math.sin((b[1]-a[1])*radians/2)**2 + Math.cos(a[1]*radians)*Math.cos(b[1]*radians)*Math.sin((b[0]-a[0])*radians/2)**2;
  return 12742000 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
};
let nearest = { distance: Infinity, index: 0, point: points[0] };
for (let i=0;i<points.length-1;i++) {
  const a=points[i], b=points[i+1], factor=Math.cos(anchor[1]*radians);
  const dx=(b[0]-a[0])*factor, dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((anchor[0]-a[0])*factor*dx+(anchor[1]-a[1])*dy)/(dx*dx+dy*dy || 1)));
  const point=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])], distance=metres(point,anchor);
  if(distance<nearest.distance)nearest={distance,index:i,point};
}
const coordinates=points.slice(0,nearest.index+1);
if(metres(coordinates.at(-1),nearest.point)>.001)coordinates.push(nearest.point);
const segments=coordinates.slice(1).map((p,i)=>metres(coordinates[i],p));
const lengthMetres=segments.reduce((a,b)=>a+b,0);
if(!Number.isFinite(lengthMetres)||lengthMetres<50000||lengthMetres>100000||Math.max(...segments)>500||nearest.distance>100)throw new Error('Corridor extraction outside expected bounds; inspect source');
const properties={id:'pretoria-johannesburg-candidate',name:'Pretoria–Johannesburg mapped rail candidate',lengthMetres,
  source:'OpenStreetMap',attribution:'© OpenStreetMap contributors',license:'ODbL-1.0',
  sourceFile:'data/route-ride.geojson',sourceSha256:createHash('sha256').update(sourceText).digest('hex'),
  railAlignmentVerified:(source.features?.[0]??source).properties.railAlignmentVerified === true,
  confidence:'osm-mapped-connected-candidate',geometryType:'osm-rail-graph-shortest-path-candidate',
  reviewStatus:'automated-geometry-checks-passed-operational-route-review-pending',
  intendedUse:'Geographic simulation, not a current passenger service or timetable',
  hubOrder:['pretoria','johannesburg'],endpointAnchorDistanceMetres:nearest.distance};
const result={type:'Feature',properties,geometry:{type:'LineString',coordinates}};
for(const prefix of ['data','public/data'])await writeFile(`${prefix}/route-gauteng.geojson`,JSON.stringify(result));
// The old animation slice inherited the full 1,582 km route length.
for(const prefix of ['data','public/data']) {
  const path=`${prefix}/route-animation.geojson`, doc=JSON.parse(await readFile(path,'utf8'));
  const feature=doc.features?.[0]??doc, cs=feature.geometry.coordinates;
  feature.properties.lengthMetres=cs.slice(1).reduce((sum,p,i)=>sum+metres(cs[i],p),0);
  feature.properties.extent='pretoria-animation-slice';
  await writeFile(path,JSON.stringify(doc));
}
console.log(JSON.stringify({points:coordinates.length,lengthMetres,maxSegmentMetres:Math.max(...segments),endpointDistanceMetres:nearest.distance,reviewStatus:properties.reviewStatus},null,2));
