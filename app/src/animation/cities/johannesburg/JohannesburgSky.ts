import * as THREE from 'three';

/** Procedural sky, entirely local; no environment map or imagery download. */
export function createJohannesburgSky() {
  const geometry = new THREE.SphereGeometry(1800, 24, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { night: { value: 0 } },
    vertexShader: `varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      varying vec3 direction; uniform float night;
      void main(){
        vec3 d=normalize(direction); float height=pow(max(d.y,0.),.55);
        vec3 day=mix(vec3(.73,.69,.59),vec3(.22,.43,.67),height);
        vec3 dusk=mix(vec3(.32,.22,.25),vec3(.035,.06,.13),height);
        vec3 color=mix(day,dusk,night);
        float sun=pow(max(dot(d,normalize(vec3(-.65,.33,-.45))),0.),320.);
        color+=sun*mix(vec3(.8,.49,.18),vec3(.18,.09,.08),night);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, setNight(value: boolean) { material.uniforms.night.value = value ? 1 : 0; }, dispose() { geometry.dispose(); material.dispose(); mesh.removeFromParent(); } };
}
