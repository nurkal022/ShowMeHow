import { createLab, tr } from '../common.js';
import { buildGlobe } from './globe.js';
import { buildTectonics } from './tectonics.js';
import { buildVolcano } from './volcano.js';

const S1 = tr('Недра Земли', 'Жер қойнауы', 'Earth’s Interior'), S2 = tr('Тектоника', 'Тектоника', 'Tectonics'), S3 = tr('Вулкан', 'Жанартау', 'Volcano');
const lab = createLab({
  title: S1,
  hint: tr('Глобус можно взять и повернуть, «Открыть разрез» показывает слои. На тектонике рычаг задаёт движение плит, на вулкане — нагнетайте давление в очаге.',
    'Глобусты алып, бұруға болады, «Кесікті ашу» қабаттарды көрсетеді. Тектоникада тұтқа плиталардың қозғалысын басқарады, жанартауда ошақтағы қысымды арттырыңыз.',
    'Grab the globe and turn it; “Open section” reveals the layers. At the tectonics station the lever sets plate motion; at the volcano, build up pressure in the magma chamber.'),
  stations: [
    { name: S1, at: [0, 1.7, 1.45], look: [0, 1.3, -0.55] },
    { name: S2, at: [9, 1.8, 2.3], look: [9, 1.05, -0.5] },
    { name: S3, at: [-8, 1.7, 2.1], look: [-8, 1.0, -0.4] },
  ],
  sky: 0x080b13, fogFar: 42,
});
const { THREE, scene } = lab;

// Звёзды вдалеке — без тумана, чтобы зал не казался коробкой.
{
  const n = 900, p = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.randomDirection(); v.y = Math.abs(v.y) * 0.9 + 0.05; v.normalize().multiplyScalar(70);
    p.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbcd0ff, size: 0.18, fog: false, transparent: true, opacity: 0.8 })));
}

const updGlobe = buildGlobe(lab, [0, 0, -0.55], S1);
const updTect = buildTectonics(lab, [9, 0, 0], S2);
const updVolc = buildVolcano(lab, [-8, 0, -0.4], S3);

lab.setFrame((dt, t) => {
  updGlobe(dt, t);
  updTect(dt, t);
  updVolc(dt, t);
});
