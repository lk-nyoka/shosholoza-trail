import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(DrawSVGPlugin, MorphSVGPlugin, SplitText);

export const PHOTO_MOVES = {
  kimberley: { name: 'Push into the crater', x: .004, y: .015, zoom: 1.18 },
  matjiesfontein: { name: 'Dolly along the veranda', x: .055, y: .002, zoom: 1.07 },
  'beaufort-west': { name: 'Tilt from scrub to koppies', x: -.004, y: -.05, zoom: 1.09 },
  'de-aar': { name: 'Follow rails toward the vanishing point', x: -.012, y: .018, zoom: 1.2 },
  worcester: { name: 'Rise over the Hex escarpment', x: .016, y: -.06, zoom: 1.12 },
  'cape-town': { name: 'Pull back to reveal Table Mountain', x: -.01, y: -.02, zoom: 1.015 },
  pretoria: { name: 'Drift up through the canopy', x: .022, y: -.04, zoom: 1.14 },
  johannesburg: { name: 'Rise past the towers', x: -.025, y: -.065, zoom: 1.1 },
} as const;

const vertex = `attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment = `precision mediump float;
varying vec2 uv; uniform sampler2D photo; uniform sampler2D depth;
uniform vec2 crop; uniform vec2 motion; uniform float zoom;
void main(){
 vec2 base=(vec2(uv.x,1.-uv.y)-.5)*crop/zoom+.5;
 float nearDepth=texture2D(depth,base).r;
 // Both textures use identical cover crop. Relative inverse depth moves the
 // foreground more than the background, rather than moving a flat image.
 vec2 displaced=base+motion*(.12+.88*nearDepth);
 float refined=texture2D(depth,clamp(displaced,vec2(.001),vec2(.999))).r;
 displaced=base+motion*(.12+.88*refined);
 gl_FragColor=texture2D(photo,clamp(displaced,vec2(.001),vec2(.999)));
}`;

export function mountPhotoParallax(root: HTMLElement, hubId: string, reduced: boolean) {
  const move = PHOTO_MOVES[hubId as keyof typeof PHOTO_MOVES];
  if (!move) return { destroy() {} };
  const canvas = document.createElement('canvas');
  canvas.className = 'st-depth-photo localized-depth-canvas';
  canvas.dataset.depthState = 'loading';
  canvas.setAttribute('aria-hidden', 'true');
  root.prepend(canvas);
  let disposed = false, contextLost = false;
  let timeline: gsap.core.Timeline | undefined;
  let titleTimeline: gsap.core.Timeline | undefined;
  let split: SplitText | undefined;
  let release = () => {};
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const images = [new Image(), new Image()];
  root.dataset.parallax = 'loading';
  root.dataset.cameraMove = move.name;
  const paused = () => reduced || media.matches || root.dataset.paused === 'true' || document.hidden || contextLost;
  const sync = () => { timeline?.paused(paused()); titleTimeline?.paused(paused()); };
  const observer = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'data-restart')) { timeline?.restart(); draw(); }
    sync();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-paused', 'data-restart'] });
  media.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  let draw = () => {};
  const resize = new ResizeObserver(() => draw()); resize.observe(root);

  function start() {
    if (disposed || !images.every(image => image.complete && image.naturalWidth)) return;
    release(); timeline?.kill(); titleTimeline?.kill(); split?.revert();
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!gl) { root.dataset.parallax = 'unavailable'; canvas.dataset.depthState='unavailable'; canvas.hidden = true; return; }
    const shaders: WebGLShader[] = [];
    const shader = (type: number, source: string) => {
      const result = gl.createShader(type)!; shaders.push(result); gl.shaderSource(result, source); gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error('Photo shader compile failed');
      return result;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Photo shader link failed');
    gl.useProgram(program);
    const buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
    const textures = images.map((image, index) => {
      const texture = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      gl.uniform1i(gl.getUniformLocation(program,index === 0 ? 'photo' : 'depth'),index); return texture;
    });
    release = () => { textures.forEach(texture => gl.deleteTexture(texture)); gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(value => gl.deleteShader(value)); };
    const motionLocation = gl.getUniformLocation(program,'motion'), zoomLocation = gl.getUniformLocation(program,'zoom'), cropLocation = gl.getUniformLocation(program,'crop');
    const camera = { x: -move.x*.35, y: -move.y*.35, zoom: hubId === 'cape-town' ? 1.23 : 1.06 };
    draw = () => {
      if (disposed || contextLost) return;
      const width = Math.max(1, root.clientWidth), height = Math.max(1, root.clientHeight), dpr = Math.min(1.5, devicePixelRatio || 1);
      if (canvas.width !== Math.round(width*dpr) || canvas.height !== Math.round(height*dpr)) { canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr); }
      gl.viewport(0,0,canvas.width,canvas.height); gl.useProgram(program);
      const photoAspect=images[0].naturalWidth/images[0].naturalHeight, viewAspect=width/height;
      gl.uniform2f(cropLocation,viewAspect<photoAspect?viewAspect/photoAspect:1,viewAspect>photoAspect?photoAspect/viewAspect:1);
      gl.uniform2f(motionLocation,camera.x,camera.y); gl.uniform1f(zoomLocation,camera.zoom); gl.drawArrays(gl.TRIANGLES,0,6);
      root.dataset.parallaxProgress = timeline?.progress().toFixed(3) ?? '0';
    };
    root.dataset.parallax = 'ready'; canvas.dataset.depthState='ready'; canvas.hidden = false;
    timeline = gsap.timeline({ repeat: -1, yoyo: true, repeatDelay: .8, paused: true, onUpdate: draw });
    timeline.to(camera,{x:move.x,y:move.y,zoom:move.zoom,duration:12,ease:'sine.inOut'},0);
    const paths = root.querySelectorAll('svg .scene-draw path,svg path.scene-draw');
    if (paths.length) timeline.fromTo(paths,{drawSVG:'0%'},{drawSVG:'100%',duration:8,stagger:.15,ease:'sine.inOut'},1);
    const motif = root.querySelector<SVGPathElement>('svg .scene-weave-a');
    if (motif) timeline.to(motif,{morphSVG:'M38 115 C180 65 250 310 405 209 S635 105 770 155',duration:10,ease:'sine.inOut'},0);
    const arrivalTitle = root.closest('.ride-arrival')?.querySelector('h1');
    if (arrivalTitle && !paused()) {
      split = SplitText.create(arrivalTitle,{type:'words'});
      titleTimeline = gsap.timeline().from(split.words,{y:15,autoAlpha:0,duration:.7,stagger:.07,ease:'power2.out'});
    }
    draw(); sync();
  }
  const fail = () => { root.dataset.parallax='unavailable'; canvas.dataset.depthState='error'; canvas.hidden=true; };
  images.forEach((image,index) => { image.onload=() => { try {start();} catch {fail();} }; image.onerror=fail; image.src=`/assets/photos/${hubId}${index ? '-depth' : ''}.webp`; });
  const lost = (event: Event) => { event.preventDefault(); contextLost=true; sync(); canvas.hidden=true; root.dataset.parallax='context-lost'; canvas.dataset.depthState='context-lost'; };
  const restored = () => { contextLost=false; try {start();} catch {fail();} };
  canvas.addEventListener('webglcontextlost',lost); canvas.addEventListener('webglcontextrestored',restored);
  return { destroy() { disposed=true; timeline?.kill(); titleTimeline?.kill(); split?.revert(); observer.disconnect(); resize.disconnect(); media.removeEventListener('change',sync); document.removeEventListener('visibilitychange',sync); canvas.removeEventListener('webglcontextlost',lost); canvas.removeEventListener('webglcontextrestored',restored); images.forEach(image=>{image.onload=null;image.onerror=null;}); release(); canvas.remove(); } };
}
