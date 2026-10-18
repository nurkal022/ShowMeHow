/**
 * Поле фотонов на одном InstancedMesh: один вызов отрисовки на сотни частиц —
 * то, что нужно Quest. Логику движения задаёт сцена через step(ph, dt).
 */
export function createPhotons(THREE, scene, max = 240) {
  const geo = new THREE.SphereGeometry(1, 6, 4);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < max; i++) mesh.setColorAt(i, col.set(0xffffff));
  scene.add(mesh);

  const items = Array.from({ length: max }, (_, i) => ({
    i, alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), kind: 0, size: 0.012, life: 0, data: {},
    color(hex) { col.set(hex); mesh.setColorAt(i, col); mesh.instanceColor.needsUpdate = true; },
  }));
  const dummy = new THREE.Object3D();
  const Z = new THREE.Vector3(0, 0, 1);
  const dir = new THREE.Vector3();
  let cursor = 0;

  return {
    mesh,
    alive() { let n = 0; for (const it of items) if (it.alive) n++; return n; },
    spawn(p, v, hex, kind = 0, size = 0.012) {
      for (let k = 0; k < max; k++) {
        const it = items[(cursor + k) % max];
        if (it.alive) continue;
        cursor = (it.i + 1) % max;
        it.alive = true; it.p.copy(p); it.v.copy(v); it.kind = kind; it.size = size; it.life = 0; it.data = {};
        it.color(hex);
        return it;
      }
      return null;
    },
    update(dt, step) {
      for (const it of items) {
        if (it.alive) {
          it.life += dt;
          it.p.addScaledVector(it.v, dt);
          if (step(it, dt) === false) it.alive = false;
        }
        if (it.alive) {
          dummy.position.copy(it.p);
          const sp = it.v.length();
          if (sp > 1e-4) dummy.quaternion.setFromUnitVectors(Z, dir.copy(it.v).divideScalar(sp));
          dummy.scale.set(it.size, it.size, it.size * (sp > 0.3 ? 3.2 : 1));
        } else {
          dummy.scale.setScalar(0);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(it.i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { for (const it of items) it.alive = false; },
  };
}

/** Мягкое пятно света для ламп: радиальный градиент на canvas. */
export function glowTexture(THREE, inner = 'rgba(255,240,200,1)', outer = 'rgba(255,180,60,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.35, 'rgba(255,210,120,0.55)');
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
