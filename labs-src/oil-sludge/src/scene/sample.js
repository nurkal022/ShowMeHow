// Куб образца: поля модели в 3D-текстуре, режимы отображения, секущая плоскость.
import * as THREE from 'three';

export const MODES = [
  { id: 'real', name: 'Реальный' },
  { id: 'thermal', name: 'Тепловизор' },
  { id: 'water', name: 'Вода' },
  { id: 'oil', name: 'Нефть' },
  { id: 'coke', name: 'Кокс' },
];

const vert = /* glsl */ `
uniform float uSize;
varying vec3 vUvw;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vUvw = position / uSize + 0.5;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D uTex;
uniform int uMode;
uniform vec4 uPlane;
uniform float uIsCap;
uniform float uTmax;
uniform float uTamb;
uniform float uOilLoad;
uniform float uWaterLoad;
uniform float uN;
varying vec3 vUvw;
varying vec3 vN;
varying vec3 vWorld;

vec3 inferno(float t) {
  t = clamp(t, 0.0, 1.0);
  const vec3 c0 = vec3(0.0002189403691192265, 0.001651004631001012, -0.01948089843709184);
  const vec3 c1 = vec3(0.1065134194856116, 0.5639564367884091, 3.932712388889277);
  const vec3 c2 = vec3(11.60249308247187, -3.972853965665698, -15.9423941062914);
  const vec3 c3 = vec3(-41.70399613139459, 17.43639888205313, 44.35414519872813);
  const vec3 c4 = vec3(77.162935699427, -33.40235894210092, -81.80730925738993);
  const vec3 c5 = vec3(-71.31942824499214, 32.62606426397723, 73.20951985803202);
  const vec3 c6 = vec3(25.13112622477341, -12.24266895238567, -23.07032500287172);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
  if (uIsCap < 0.5 && dot(vUvw, uPlane.xyz) > uPlane.w) discard;
  vec3 uvw = clamp(vUvw, 0.5 / uN, 1.0 - 0.5 / uN);
  vec4 d = texture(uTex, uvw);
  float T = d.r, w = clamp(d.g, 0.0, 1.0), o = clamp(d.b, 0.0, 1.0), ck = clamp(d.a, 0.0, 1.0);

  vec3 N = normalize(vN);
  vec3 L = normalize(vec3(0.35, 0.9, 0.45));
  vec3 V = normalize(cameraPosition - vWorld);
  float diff = max(dot(N, L), 0.0);
  float hemi = 0.55 + 0.45 * N.y;
  vec3 col;
  vec3 emit = vec3(0.0);
  float spec = 0.0;
  float grain = vnoise(vUvw * 90.0) * 0.6 + vnoise(vUvw * 23.0) * 0.4;

  if (uMode == 0) {
    vec3 dry = toLin(vec3(0.74, 0.64, 0.49)) * (0.85 + 0.3 * grain);
    vec3 oily = toLin(vec3(0.2, 0.14, 0.09)) * (0.8 + 0.4 * grain);
    float oil = clamp(o * uOilLoad * 1.8, 0.0, 1.0);
    col = mix(dry, oily, oil);
    col *= 1.0 - 0.38 * clamp(w * uWaterLoad * 2.0, 0.0, 1.0);
    col = mix(col, toLin(vec3(0.05, 0.05, 0.055)) * (0.7 + 0.6 * grain), ck);
    spec = 0.55 * oil + 0.35 * clamp(w * uWaterLoad * 2.0, 0.0, 1.0);
    spec *= 1.0 - ck;
    // свечение раскалённой поверхности (≈ излучение абсолютно чёрного тела, от точки Дрейпера ~525 °C)
    float g = clamp((T - 500.0) / 450.0, 0.0, 1.0);
    emit = mix(vec3(0.6, 0.03, 0.0), vec3(1.0, 0.45, 0.12), g) * g * g * 3.0;
  } else if (uMode == 1) {
    float t = (T - uTamb) / max(uTmax - uTamb, 1.0);
    col = toLin(inferno(t));
    float stepT = uTmax > 320.0 ? 50.0 : 25.0;
    float q = T / stepT;
    float line = 1.0 - smoothstep(0.0, fwidth(q) * 1.4, abs(fract(q - 0.5) - 0.5));
    col *= 1.0 - 0.55 * line;
    emit = col * 0.55;
    col *= 0.5;
  } else if (uMode == 2) {
    col = mix(toLin(vec3(0.25, 0.25, 0.27)), toLin(vec3(0.15, 0.55, 1.0)), w);
    emit = col * 0.3 * w;
  } else if (uMode == 3) {
    col = mix(toLin(vec3(0.25, 0.25, 0.27)), toLin(vec3(1.0, 0.62, 0.12)), o);
    emit = col * 0.3 * o;
  } else {
    col = mix(toLin(vec3(0.62, 0.6, 0.56)), toLin(vec3(0.04, 0.04, 0.04)), ck);
  }

  vec3 H = normalize(L + V);
  float s = pow(max(dot(N, H), 0.0), 48.0) * spec;
  vec3 lit = col * (0.35 * hemi + 0.85 * diff) + vec3(s) + emit;
  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class SampleView {
  constructor(size, N) {
    this.size = size;
    this.N = N;
    this.group = new THREE.Group();
    this.alloc(N);
    this.uniforms = {
      uTex: { value: this.tex },
      uMode: { value: 0 },
      uPlane: { value: new THREE.Vector4(0, 0, 0, 2) },
      uIsCap: { value: 0 },
      uTmax: { value: 250 },
      uTamb: { value: 20 },
      uOilLoad: { value: 0.6 },
      uWaterLoad: { value: 0.5 },
      uN: { value: N },
      uSize: { value: size },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag });
    this.capMat = this.mat.clone();
    this.capMat.uniforms = { ...this.uniforms, uIsCap: { value: 1 } };
    this.capMat.side = THREE.DoubleSide;

    this.box = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), this.mat);
    this.group.add(this.box);
    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.box.geometry),
      new THREE.LineBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.6 }),
    );
    this.group.add(this.edges);

    this.capGeo = new THREE.BufferGeometry();
    this.capGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    this.capGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    this.capGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.cap = new THREE.Mesh(this.capGeo, this.capMat);
    this.cap.visible = false;
    this.group.add(this.cap);

    // рамка сечения
    this.capLine = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x3dc3ff }));
    this.capLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    this.capLine.visible = false;
    this.group.add(this.capLine);
  }

  alloc(N) {
    this.N = N;
    this.data = new Uint16Array(N * N * N * 4);
    this.tex?.dispose();
    this.tex = new THREE.Data3DTexture(this.data, N, N, N);
    this.tex.format = THREE.RGBAFormat;
    this.tex.type = THREE.HalfFloatType;
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.unpackAlignment = 1;
    this.tex.needsUpdate = true;
    if (this.uniforms) { this.uniforms.uTex.value = this.tex; this.uniforms.uN.value = N; }
  }

  setData(tex, N) {
    if (N !== this.N) this.alloc(N);
    this.data.set(tex);
    this.tex.needsUpdate = true;
  }

  setMode(id) { this.uniforms.uMode.value = Math.max(0, MODES.findIndex((m) => m.id === id)); }

  // Сечение: axis ∈ {none, x, y, z}; pos ∈ (0,1). Удаляется часть с координатой > pos.
  setSlice(axis, pos) {
    const P = this.uniforms.uPlane.value;
    if (axis === 'none') { P.set(0, 0, 0, 2); this.cap.visible = this.capLine.visible = false; return; }
    const n = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis];
    P.set(n[0], n[1], n[2], pos);
    const s = this.size, c = (pos - 0.5) * s, h = s / 2;
    let pts;
    if (axis === 'x') pts = [[c, -h, -h], [c, -h, h], [c, h, h], [c, h, -h]];
    else if (axis === 'y') pts = [[-h, c, -h], [h, c, -h], [h, c, h], [-h, c, h]];
    else pts = [[-h, -h, c], [h, -h, c], [h, h, c], [-h, h, c]];
    const pa = this.capGeo.attributes.position, na = this.capGeo.attributes.normal;
    const la = this.capLine.geometry.attributes.position;
    pts.forEach((p, i) => { pa.setXYZ(i, ...p); na.setXYZ(i, ...n); la.setXYZ(i, ...p); });
    pa.needsUpdate = na.needsUpdate = la.needsUpdate = true;
    this.capGeo.computeBoundingSphere();
    this.capLine.geometry.computeBoundingSphere();
    this.cap.visible = this.capLine.visible = true;
  }
}
