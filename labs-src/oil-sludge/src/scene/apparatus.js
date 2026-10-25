// Установка: термовоздуходувка (фен), решётка на лабораторных весах, поддон для стекающей нефти.
import * as THREE from 'three';
import { LAYOUT, Display } from './lab.js';
import { tr } from '../i18n.js';

const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0xc3c9cf, roughness: 0.3, metalness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.3 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xe8661c, roughness: 0.45 }),
  black: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7 }),
  scale: new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.4 }),
};

// цвет нагретого металла/спирали по температуре (качественно, по закону излучения)
export function glowColor(Tc, out = new THREE.Color()) {
  const g = Math.min(1, Math.max(0, (Tc - 350) / 500));
  out.setRGB(0.9 * g + 0.1 * g * g, 0.25 * g * g, 0.05 * g * g * g);
  return out.multiplyScalar(2.5 * g);
}

export class Apparatus {
  constructor(scene) {
    const g = (this.group = new THREE.Group());
    scene.add(g);
    const c = LAYOUT.sampleCenter, S = LAYOUT.sampleSize;
    const by = LAYOUT.benchY, gy = LAYOUT.grateY;

    // весы
    const scaleBase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.3), M.scale);
    scaleBase.position.set(c.x, by + 0.03, c.z + 0.02);
    g.add(scaleBase);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.008, 40), M.steel);
    plate.position.set(c.x, by + 0.064, c.z);
    g.add(plate);
    this.scaleDisp = new Display(0.13, 0.04, 512);
    this.scaleDisp.mesh.position.set(c.x, by + 0.032, c.z + 0.171);
    g.add(this.scaleDisp.mesh);

    // поддон для стекающей нефти (стоит на весах — масса образца + собранная нефть = показание весов)
    const trayY = by + 0.07;
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.115, 0.03, 40, 1, true), M.steel);
    tray.position.set(c.x, trayY + 0.015, c.z);
    g.add(tray);
    const trayBottom = new THREE.Mesh(new THREE.CircleGeometry(0.115, 40), M.steel);
    trayBottom.rotation.x = -Math.PI / 2; trayBottom.position.set(c.x, trayY + 0.001, c.z);
    g.add(trayBottom);
    this.oilPool = new THREE.Mesh(
      new THREE.CircleGeometry(0.113, 40),
      new THREE.MeshStandardMaterial({ color: 0x120a04, roughness: 0.08, metalness: 0.2 }),
    );
    this.oilPool.rotation.x = -Math.PI / 2;
    this.oilPool.position.set(c.x, trayY + 0.002, c.z);
    this.oilPool.visible = false;
    g.add(this.oilPool);
    this.trayY = trayY;

    // стойка и решётка
    const legH = gy - trayY - 0.03;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, legH, 8), M.steel);
      leg.position.set(c.x + dx * 0.15, trayY + 0.03 + legH / 2, c.z + dz * 0.15);
      g.add(leg);
    }
    const frame = new THREE.Group();
    const bar = (w, d, x, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.008, d), M.steel);
      b.position.set(c.x + x, gy, c.z + z); frame.add(b);
    };
    bar(0.32, 0.012, 0, -0.155); bar(0.32, 0.012, 0, 0.155);
    bar(0.012, 0.32, -0.155, 0); bar(0.012, 0.32, 0.155, 0);
    for (let i = -6; i <= 6; i++) bar(0.003, 0.3, i * 0.022, 0);
    g.add(frame);

    // термовоздуходувка: сопло направлено вдоль +x под нижнюю грань образца
    const gun = (this.gun = new THREE.Group());
    const nozzleX = c.x - S / 2 - 0.035;
    const ny = gy - 0.03;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 32), M.orange);
    body.rotation.z = Math.PI / 2; body.position.set(nozzleX - 0.16, ny, c.z);
    gun.add(body);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 32), M.black);
    back.rotation.z = Math.PI / 2; back.position.set(nozzleX - 0.27, ny, c.z);
    gun.add(back);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.034, 0.07, 32, 1, true), M.steel);
    nozzle.rotation.z = Math.PI / 2; nozzle.position.set(nozzleX - 0.025, ny, c.z);
    gun.add(nozzle);
    this.coil = new THREE.Mesh(
      new THREE.TorusGeometry(0.016, 0.004, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x000000, roughness: 0.5 }),
    );
    this.coil.rotation.y = Math.PI / 2; this.coil.position.set(nozzleX - 0.03, ny, c.z);
    gun.add(this.coil);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.035), M.black);
    handle.position.set(nozzleX - 0.2, ny - 0.08, c.z);
    gun.add(handle);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, ny - by - 0.14, 8), M.steel);
    stand.position.set(nozzleX - 0.2, by + (ny - by - 0.14) / 2, c.z);
    gun.add(stand);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.12), M.dark);
    foot.position.set(nozzleX - 0.2, by + 0.006, c.z);
    gun.add(foot);
    this.gunDisp = new Display(0.09, 0.045, 512);
    this.gunDisp.mesh.position.set(nozzleX - 0.16, ny + 0.0465, c.z);
    this.gunDisp.mesh.rotation.x = -Math.PI / 2;
    gun.add(this.gunDisp.mesh);
    g.add(gun);
    this.nozzle = new THREE.Vector3(nozzleX + 0.01, ny, c.z);

    // свет от раскалённого образца/спирали
    this.glowLight = new THREE.PointLight(0xff5a1a, 0, 1.2, 2);
    this.glowLight.position.set(c.x, gy + 0.02, c.z);
    g.add(this.glowLight);

    // ограничение лотка в мл → высота слоя
    this.poolMaxMl = 120;
  }

  update(state, snap) {
    const run = state.running;
    const Tf = state.cfg.Tf;
    // спираль фена светится при работе
    const col = glowColor(run ? Tf + 250 : 20);
    this.coil.material.emissive.copy(col);
    // свечение образца, если поверхность раскалена
    const maxT = snap?.maxT ?? 20;
    this.glowLight.intensity = Math.max(0, (maxT - 480) / 300) * 0.6 + (run ? Math.max(0, (Tf - 300) / 300) * 0.25 : 0);

    // слой собранной нефти
    if (snap) {
      const ml = (snap.acc.drained / 900) * 1e6;
      this.oilPool.visible = ml > 0.05;
      const f = Math.min(1, ml / this.poolMaxMl);
      this.oilPool.position.y = this.trayY + 0.002 + f * 0.024;
      this.oilPool.scale.setScalar(0.35 + 0.65 * Math.min(1, Math.sqrt(ml / 10)));
    }
  }

  drawDisplays(state, snap) {
    this.gunDisp.draw((c, w, h) => {
      c.fillStyle = state.running ? '#7dffb0' : '#4c7a62';
      c.font = '700 92px "Roboto Mono", monospace';
      c.fillText(`${Math.round(state.cfg.Tf)}°C`, 24, 110);
      c.font = '600 60px "Roboto Mono", monospace';
      c.fillText(`${state.cfg.U.toFixed(2)} ${tr('м/с', 'м/с', 'm/s')}`, 24, 200);
      c.fillStyle = state.running ? '#ff7a2a' : '#553322';
      c.beginPath(); c.arc(w - 50, 60, 22, 0, 7); c.fill();
    });
    this.scaleDisp.draw((c, w, h) => {
      const g = snap ? (snap.mass + snap.acc.drained) * 1000 : 0;
      c.fillStyle = '#7dffb0';
      c.font = '700 110px "Roboto Mono", monospace';
      c.textAlign = 'right';
      c.fillText(`${g.toFixed(1)} g`, w - 24, h - 40);
      c.textAlign = 'left';
    });
  }
}
