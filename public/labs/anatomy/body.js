/**
 * Станция 2: голографический силуэт человека, малый и большой круги кровообращения
 * светящимися трубками. Частицы краснеют в лёгких и синеют в тканях.
 * Координаты силуэта — в метрах «настоящего» человека ростом 1,75 м; группа масштабируется.
 */
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const noRay = () => {};

const holo = () => new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(0x4f9dff) }, opacity: { value: 0.7 } },
  vertexShader: `varying vec3 vN; varying vec3 vV;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 color; uniform float opacity; varying vec3 vN; varying vec3 vV;
    void main(){ float r = 1.0 - abs(dot(normalize(vN), normalize(vV))); r = pow(r, 2.4);
      gl_FragColor = vec4(color * (0.12 + 1.5 * r), (0.04 + r) * opacity); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

/** Капсула между двумя точками. */
function limb(a, b, r, mat) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  m.raycast = noRay;
  return m;
}

const RED = new THREE.Color(0xff3640), BLUE = new THREE.Color(0x3d7bff);

export function buildBody(lab, { onOrgan }) {
  const root = new THREE.Group();
  const shellMat = holo();
  const silhouette = new THREE.Group();
  root.add(silhouette);

  // ---------- Силуэт ----------
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 32, 24), shellMat);
  head.scale.set(0.9, 1.08, 1); head.position.set(0, 1.63, 0); head.raycast = noRay;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.42, 8, 24), shellMat);
  torso.scale.set(1.2, 1, 0.66); torso.position.set(0, 1.2, 0); torso.raycast = noRay;
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), shellMat);
  pelvis.scale.set(1.05, 0.62, 0.7); pelvis.position.set(0, 0.93, 0); pelvis.raycast = noRay;
  silhouette.add(head, torso, pelvis,
    limb(V(0, 1.45, 0), V(0, 1.55, 0), 0.05, shellMat));
  for (const sx of [-1, 1]) {
    silhouette.add(
      limb(V(0.2 * sx, 1.41, 0), V(0.27 * sx, 1.13, 0.01), 0.045, shellMat),
      limb(V(0.27 * sx, 1.13, 0.01), V(0.31 * sx, 0.87, 0.06), 0.038, shellMat),
      limb(V(0.31 * sx, 0.87, 0.06), V(0.32 * sx, 0.76, 0.07), 0.03, shellMat),
      limb(V(0.1 * sx, 0.9, 0), V(0.11 * sx, 0.5, 0.01), 0.065, shellMat),
      limb(V(0.11 * sx, 0.5, 0.01), V(0.12 * sx, 0.1, -0.01), 0.05, shellMat),
      limb(V(0.12 * sx, 0.04, -0.01), V(0.12 * sx, 0.04, 0.11), 0.035, shellMat),
    );
  }

  // ---------- Органы ----------
  const organs = [];
  const organ = (name, text, geo, color, at, scale, rot = 0) => {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.45, transparent: true, opacity: 0.82 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(at); m.scale.set(...scale); m.rotation.z = rot;
    root.add(m);
    const o = { mesh: m, name, text, glow: 0, base: scale };
    organs.push(o);
    lab.hover(m, () => { o.glow = 1; onOrgan(o); return `${name}\n${text.split('\n')[0]}`; });
    return o;
  };
  const sph = new THREE.SphereGeometry(1, 24, 18);
  const brain = organ('Мозг', 'Получает ~15% всей крови, хотя весит 2% тела.\nНейроны забирают кислород и глюкозу, кровь уходит венозной.', sph, 0xf2a6c8, V(0, 1.665, 0.005), [0.075, 0.06, 0.085]);
  const lungR = organ('Правое лёгкое', 'Малый круг: в капиллярах альвеол CO₂ уходит в воздух,\nO₂ садится на гемоглобин — кровь становится алой.', sph, 0xff9fb0, V(-0.085, 1.3, 0), [0.07, 0.125, 0.065]);
  const lungL = organ('Левое лёгкое', 'Малый круг: газообмен через стенку альвеол толщиной 0,5 мкм.\nВенозная кровь из лёгочной артерии превращается в артериальную.', sph, 0xff9fb0, V(0.09, 1.29, 0), [0.062, 0.12, 0.062]);
  const heart = organ('Сердце', 'Два насоса в одном: правая половина гонит кровь в малый круг,\nлевая — в большой. За сутки перекачивает ~7 000 л.', sph, 0xe03344, V(0.025, 1.24, 0.045), [0.05, 0.055, 0.045], -0.4);
  const liver = organ('Печень', 'Получает кровь от кишечника по воротной вене,\nчистит её от токсинов и запасает глюкозу.', sph, 0xa04a3a, V(-0.075, 1.11, 0.03), [0.105, 0.05, 0.065], 0.15);
  const gut = organ('Кишечник', 'Питательные вещества всасываются в кровь капилляров,\nа она по воротной вене идёт сначала в печень.', new THREE.TorusGeometry(1, 0.42, 10, 24), 0xe0b070, V(0, 0.98, 0.035), [0.075, 0.06, 0.06]);
  const kidL = organ('Почки', 'Фильтруют ~180 л плазмы в сутки, оставляя 1,5 л мочи.\nКровь отдаёт им мочевину и лишнюю воду.', sph, 0x9c3b6e, V(0.065, 1.06, -0.05), [0.026, 0.042, 0.022], -0.2);
  const kidR = organ('Почки', 'Фильтруют ~180 л плазмы в сутки, оставляя 1,5 л мочи.\nКровь отдаёт им мочевину и лишнюю воду.', sph, 0x9c3b6e, V(-0.065, 1.06, -0.05), [0.026, 0.042, 0.022], 0.2);
  const legs = [-1, 1].map((sx) => organ('Мышцы ног', 'В нагрузке забирают до 80% кислорода из крови:\nсердце учащается, сосуды мышц расширяются.', sph, 0xc8584f, V(0.105 * sx, 0.6, 0.01), [0.055, 0.17, 0.055]));
  heart.mesh.userData.beat = true;

  // ---------- Круги ----------
  const H = V(0.025, 1.24, 0.045);
  // Точки: out — от сердца к органу (артерия), back — от органа к сердцу (вена).
  const loops = [
    { circuit: 'small', organ: lungR, out: [H, V(-0.02, 1.32, 0.03), V(-0.07, 1.34, 0.02), V(-0.095, 1.3, 0.0)], back: [V(-0.095, 1.3, 0.0), V(-0.08, 1.24, -0.02), V(-0.03, 1.22, 0.0), H] },
    { circuit: 'small', organ: lungL, out: [H, V(0.05, 1.33, 0.03), V(0.085, 1.34, 0.02), V(0.1, 1.29, 0.0)], back: [V(0.1, 1.29, 0.0), V(0.08, 1.22, -0.02), V(0.05, 1.21, 0.02), H] },
    { circuit: 'big', organ: brain, out: [H, V(0.02, 1.36, 0.0), V(0.025, 1.47, 0.0), V(0.03, 1.58, 0.01), V(0.02, 1.66, 0.01)], back: [V(-0.02, 1.66, 0.0), V(-0.035, 1.56, 0.0), V(-0.035, 1.45, -0.01), V(-0.03, 1.33, 0.0), H] },
    { circuit: 'big', organ: gut, out: [H, V(0.015, 1.15, -0.04), V(0.01, 1.03, -0.03), V(0.0, 0.98, 0.04), V(-0.04, 1.02, 0.05)], back: [V(-0.04, 1.02, 0.05), V(-0.07, 1.1, 0.04), V(-0.04, 1.14, 0.0), V(-0.01, 1.2, 0.02), H] },
    { circuit: 'big', organ: kidL, out: [H, V(0.015, 1.15, -0.04), V(0.03, 1.07, -0.05), V(0.065, 1.06, -0.05)], back: [V(0.065, 1.06, -0.05), V(0.02, 1.08, -0.03), V(-0.015, 1.15, -0.02), H] },
    { circuit: 'big', organ: kidR, out: [H, V(0.015, 1.15, -0.04), V(-0.02, 1.07, -0.05), V(-0.065, 1.06, -0.05)], back: [V(-0.065, 1.06, -0.05), V(-0.03, 1.1, -0.03), V(-0.015, 1.16, -0.02), H] },
    ...[-1, 1].map((sx) => ({ circuit: 'big', organ: legs[(sx + 1) / 2],
      out: [H, V(0.015, 1.12, -0.04), V(0.03 * sx, 0.92, -0.03), V(0.1 * sx, 0.82, 0.0), V(0.11 * sx, 0.5, 0.03), V(0.12 * sx, 0.12, 0.02)],
      back: [V(0.12 * sx, 0.12, 0.02), V(0.1 * sx, 0.3, -0.02), V(0.09 * sx, 0.6, -0.03), V(0.06 * sx, 0.88, -0.05), V(-0.01, 1.05, -0.03), H] })),
    ...[-1, 1].map((sx) => ({ circuit: 'big', organ: null,
      out: [H, V(0.02, 1.36, 0.0), V(0.17 * sx, 1.4, 0.0), V(0.27 * sx, 1.13, 0.03), V(0.32 * sx, 0.8, 0.07)],
      back: [V(0.32 * sx, 0.8, 0.07), V(0.28 * sx, 1.1, -0.01), V(0.16 * sx, 1.38, -0.02), V(-0.02, 1.34, 0.0), H] })),
  ];

  const tubeMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const groups = { small: new THREE.Group(), big: new THREE.Group() };
  root.add(groups.small, groups.big);
  for (const L of loops) {
    const outC = new THREE.CatmullRomCurve3(L.out), backC = new THREE.CatmullRomCurve3(L.back);
    const small = L.circuit === 'small';
    const r = small ? 0.0065 : 0.0055;
    for (const [c, col] of [[outC, small ? BLUE : RED], [backC, small ? RED : BLUE]]) {
      const m = new THREE.Mesh(new THREE.TubeGeometry(c, 64, r, 6), tubeMat(col));
      m.raycast = noRay;
      groups[L.circuit].add(m);
    }
    const lo = outC.getLength(), lb = backC.getLength();
    Object.assign(L, { outC, backC, lo, lb, len: lo + lb, split: lo / (lo + lb) });
  }

  // ---------- Частицы ----------
  const parts = [];
  for (const L of loops) {
    const n = Math.round(L.len * 110);
    for (let i = 0; i < n; i++) parts.push({ L, u: i / n, off: new THREE.Vector3().randomDirection().multiplyScalar(0.004 * Math.random()) });
  }
  const dots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.0085, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), parts.length);
  dots.frustumCulled = false;
  dots.raycast = noRay;
  root.add(dots);
  for (let i = 0; i < parts.length; i++) dots.setColorAt(i, RED);

  // Подложка-постамент.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.03, 48), new THREE.MeshStandardMaterial({ color: 0x14203a, emissive: 0x1a73e8, emissiveIntensity: 0.12, transparent: true, opacity: 0.6 }));
  base.position.y = 0.015; base.raycast = noRay;
  root.add(base);

  const show = { small: true, big: true };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();

  return {
    root, organs,
    toggle(circuit) { show[circuit] = !show[circuit]; groups[circuit].visible = show[circuit]; return show[circuit]; },
    update(dt, t, st, bpm) {
      // Сердце бьётся, лёгкие дышат (в нагрузке чаще).
      const hb = 1 + 0.12 * st.atria * 0.4 - 0.12 * st.vent;
      heart.mesh.scale.set(heart.base[0] * hb, heart.base[1] * hb, heart.base[2] * hb);
      const br = 1 + 0.06 * Math.sin(t * Math.PI * 2 * (0.22 + (bpm - 60) * 0.003));
      for (const l of [lungR, lungL]) l.mesh.scale.set(l.base[0] * br, l.base[1] * br, l.base[2] * br);
      for (const o of organs) {
        o.glow = Math.max(0, o.glow - dt * 0.35);
        o.mesh.material.emissiveIntensity = 0.3 + o.glow * (0.9 + 0.6 * Math.sin(t * 8));
      }

      const v = 0.12 * (bpm / 70) * (0.45 + 1.4 * st.vent);
      parts.forEach((pt, i) => {
        const L = pt.L;
        pt.u += (v * dt) / L.len;
        if (pt.u >= 1) pt.u -= 1;
        const visible = show[L.circuit];
        if (pt.u < L.split) L.outC.getPointAt(Math.min(0.999, pt.u / L.split), p);
        else L.backC.getPointAt(Math.min(0.999, (pt.u - L.split) / (1 - L.split)), p);
        p.add(pt.off);
        // Цвет: смена в органе (вокруг точки split).
        const k = THREE.MathUtils.smoothstep(pt.u, L.split - 0.05, L.split + 0.06);
        if (L.circuit === 'small') col.copy(BLUE).lerp(RED, k); else col.copy(RED).lerp(BLUE, k);
        dots.setColorAt(i, col);
        s.setScalar(visible ? 1 : 0);
        m4.compose(p, q, s);
        dots.setMatrixAt(i, m4);
      });
      dots.instanceMatrix.needsUpdate = true;
      dots.instanceColor.needsUpdate = true;
    },
  };
}
