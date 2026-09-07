/**
 * Общий boilerplate четырёх лабораторий: сцена, свет, пол-миллиметровка, VR-кнопка,
 * контроллеры Quest (луч, курок = нажать, хват = взять), телепорт по дискам,
 * а для ноутбука — орбита мышью, наведение, клик и перетаскивание.
 * Это не API для генерации, а способ не копировать одно и то же четыре раза.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const FONT = "500 44px Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Спрайт с текстом на canvas: кириллица рисуется штатно, шрифт не нужен. */
export function makeLabel(text, opts = {}) {
  const lines = String(text).split('\n');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = FONT;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 56;
  const lh = 56;
  canvas.width = Math.ceil(w);
  canvas.height = lh * lines.length + 24;
  ctx.font = FONT;
  ctx.fillStyle = opts.bg ?? 'rgba(14, 18, 28, 0.86)';
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 22);
  ctx.fill();
  ctx.fillStyle = opts.color ?? '#eef2f7';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, 28, 12 + lh * i + lh / 2));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  const scale = opts.scale ?? 0.0022;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}

/** Ставит спрайт в точку и возвращает его — для scene.add в одну строку. */
export function placeLabel(sprite, x, y, z) { sprite.position.set(x, y, z); return sprite; }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Создаёт лабораторию. stations: [{ name, at: [x,y,z], look: [x,y,z] }] — at это
 * точка на полу, куда встаёт зритель; look — куда он смотрит с ноутбука.
 */
export function createLab({ title, hint, stations, floor = 30, sky = 0x0b0f17, fogFar = 40 }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 8, fogFar);

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200);
  const player = new THREE.Group();
  player.add(camera);
  scene.add(player);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  document.body.appendChild(renderer.domElement);

  // Свет: мягкий полусферический плюс ключевой направленный, без теней — в VR дороги.
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a2030, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 8, 3);
  scene.add(key);

  // Пол-миллиметровка в духе интерфейса.
  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(floor, floor),
    new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.95, metalness: 0 }));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.name = 'floor';
  scene.add(floorMesh);
  const grid = new THREE.GridHelper(floor, floor, 0x2c3a55, 0x1d2637);
  grid.position.y = 0.002;
  scene.add(grid);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 0.3;
  controls.maxDistance = 25;

  // ---- HUD ----
  const hud = buildHud({ title, hint, stations, renderer });

  // ---- Интерактивность ----
  const raycaster = new THREE.Raycaster();
  raycaster.far = 8;
  const hoverables = []; // { object, label }
  const clickables = []; // object с userData.onClick
  const grabbables = []; // object с userData.grab {onGrab,onMove,onRelease}
  const pads = [];       // телепорт-диски

  const labelSprite = makeLabel(' ');
  labelSprite.visible = false;
  scene.add(labelSprite);
  let hovered = null;

  function pickList() { return [...hoverables.map((h) => h.object), ...clickables, ...grabbables, ...pads]; }

  function findHit(origin, dir, list) {
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(list, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !list.includes(o)) o = o.parent;
      if (o) return { object: o, point: h.point, distance: h.distance };
    }
    return null;
  }

  function showHover(hit) {
    const h = hit && hoverables.find((x) => x.object === hit.object);
    const obj = h ? h.object : null;
    if (obj !== hovered) {
      hovered = obj;
      if (h) {
        const text = typeof h.label === 'function' ? h.label() : h.label;
        const fresh = makeLabel(text);
        labelSprite.material.map = fresh.material.map;
        labelSprite.material.needsUpdate = true;
        labelSprite.scale.copy(fresh.scale);
        labelSprite.visible = true;
      } else {
        labelSprite.visible = false;
      }
    }
    if (h) {
      const box = new THREE.Box3().setFromObject(obj);
      labelSprite.position.set(hit.point.x, box.max.y + 0.16, hit.point.z);
    }
  }

  // ---- Мышь ----
  const pointer = new THREE.Vector2();
  let drag = null; // { object, plane, offset }
  const dragPlane = new THREE.Plane();
  const tmpV = new THREE.Vector3();

  function mouseRay(e) {
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return { origin: raycaster.ray.origin.clone(), dir: raycaster.ray.direction.clone() };
  }

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (renderer.xr.isPresenting) return;
    const { origin, dir } = mouseRay(e);
    if (drag) {
      raycaster.set(origin, dir);
      if (raycaster.ray.intersectPlane(dragPlane, tmpV)) {
        drag.object.position.copy(tmpV.add(drag.offset));
        drag.object.userData.grab?.onMove?.(drag.object);
      }
      return;
    }
    const hit = findHit(origin, dir, pickList());
    showHover(hit);
    renderer.domElement.style.cursor = hit ? 'pointer' : '';
  });

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (renderer.xr.isPresenting || e.button !== 0) return;
    const { origin, dir } = mouseRay(e);
    const hit = findHit(origin, dir, pickList());
    if (!hit) return;
    if (hit.object.userData.onClick) { hit.object.userData.onClick(hit.object, hit.point); return; }
    if (hit.object.userData.pad) { teleport(hit.object.userData.pad); return; }
    if (hit.object.userData.grab) {
      controls.enabled = false;
      dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), hit.object.position);
      drag = { object: hit.object, offset: hit.object.position.clone().sub(hit.point).setY(0) };
      hit.object.userData.heldBy = 'mouse';
      hit.object.userData.grab.onGrab?.(hit.object);
      renderer.domElement.setPointerCapture(e.pointerId);
    }
  });

  function endDrag() {
    if (!drag) return;
    const o = drag.object;
    drag = null;
    controls.enabled = true;
    o.userData.heldBy = null;
    o.userData.grab.onRelease?.(o);
  }
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);

  // ---- Контроллеры Quest ----
  const factory = new XRControllerModelFactory();
  const controllers = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0x8ab4f8, transparent: true, opacity: 0.7 }));
    line.scale.z = 5;
    c.add(line);
    c.userData.line = line;
    player.add(c);
    const grip = renderer.xr.getControllerGrip(i);
    grip.add(factory.createControllerModel(grip));
    player.add(grip);

    c.addEventListener('selectstart', () => {
      const hit = controllerHit(c);
      if (!hit) return;
      if (hit.object.userData.onClick) { hit.object.userData.onClick(hit.object, hit.point); return; }
      if (hit.object.userData.pad) { teleport(hit.object.userData.pad); return; }
      if (hit.object.userData.grab) grab(c, hit.object);
    });
    c.addEventListener('selectend', () => release(c));
    c.addEventListener('squeezestart', () => {
      const hit = controllerHit(c);
      if (hit?.object.userData.grab) grab(c, hit.object);
    });
    c.addEventListener('squeezeend', () => release(c));
    return c;
  });

  const tmpM = new THREE.Matrix4();
  function controllerHit(c) {
    tmpM.identity().extractRotation(c.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(tmpM);
    return findHit(origin, dir, pickList());
  }

  function grab(c, obj) {
    if (c.userData.held || obj.userData.heldBy) return;
    c.userData.held = obj;
    obj.userData.heldBy = c;
    obj.userData.grab.onGrab?.(obj);
    c.attach(obj);
  }
  function release(c) {
    const obj = c.userData.held;
    if (!obj) return;
    c.userData.held = null;
    obj.userData.heldBy = null;
    scene.attach(obj);
    obj.userData.grab.onRelease?.(obj);
  }

  // ---- Станции и телепорт ----
  const padGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.02, 40);
  stations.forEach((st) => {
    const pad = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({
      color: 0x1a73e8, emissive: 0x1a73e8, emissiveIntensity: 0.6, transparent: true, opacity: 0.55 }));
    pad.position.set(st.at[0], 0.01, st.at[2]);
    pad.userData.pad = st;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.52, 48),
      new THREE.MeshBasicMaterial({ color: 0x8ab4f8, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    pad.add(ring);
    const lbl = makeLabel(st.name, { scale: 0.0016 });
    lbl.position.y = 0.35;
    pad.add(lbl);
    scene.add(pad);
    pads.push(pad);
  });

  function teleport(st) {
    hud.markStation(st);
    if (renderer.xr.isPresenting) {
      player.position.set(st.at[0], 0, st.at[2]);
      return;
    }
    // С ноутбука — перелёт камеры за полсекунды.
    const from = camera.position.clone();
    const fromT = controls.target.clone();
    const to = new THREE.Vector3(st.at[0], st.at[1] ?? 1.6, st.at[2]);
    const toT = new THREE.Vector3(...st.look);
    const t0 = performance.now();
    fly = (now) => {
      const k = Math.min(1, (now - t0) / 600);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(from, to, e);
      controls.target.lerpVectors(fromT, toT, e);
      if (k >= 1) fly = null;
    };
  }
  let fly = null;
  hud.onStation = teleport;

  // ---- Цикл ----
  let last = performance.now();
  let onFrame = () => {};
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (fly) fly(now);
    if (renderer.xr.isPresenting) {
      for (const c of controllers) {
        if (c.userData.held) c.userData.held.userData.grab?.onMove?.(c.userData.held);
      }
      // Подпись — по лучу первого контроллера, у которого что-то под лучом.
      let hit = null;
      for (const c of controllers) { hit = controllerHit(c); if (hit) break; }
      showHover(hit);
    } else {
      controls.update();
    }
    onFrame(dt, now / 1000);
    renderer.render(scene, camera);
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  renderer.xr.addEventListener('sessionstart', () => {
    const st = hud.current ?? stations[0];
    player.position.set(st.at[0], 0, st.at[2]);
    hud.root.classList.add('in-vr');
  });
  renderer.xr.addEventListener('sessionend', () => {
    player.position.set(0, 0, 0);
    hud.root.classList.remove('in-vr');
    teleport(hud.current ?? stations[0]);
  });

  const api = {
    THREE, scene, camera, player, renderer, controls, hud, stations,
    setFrame(fn) { onFrame = fn; },
    /** Подпись при наведении; label — строка или функция, возвращающая строку. */
    hover(object, label) { hoverables.push({ object, label }); return object; },
    click(object, fn) { object.userData.onClick = fn; clickables.push(object); return object; },
    grab(object, handlers = {}) { object.userData.grab = handlers; grabbables.push(object); return object; },
    /**
     * Трёхмерная кнопка для VR и мыши: табличка с текстом, нажимается лучом/кликом.
     * Возвращает группу; setText меняет надпись.
     */
    button3d(text, at, fn, opts = {}) {
      const g = new THREE.Group();
      const w = opts.width ?? 0.5;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.05),
        new THREE.MeshStandardMaterial({ color: opts.color ?? 0x1a73e8, emissive: opts.color ?? 0x1a73e8,
          emissiveIntensity: 0.35, roughness: 0.4 }));
      g.add(box);
      let lbl = makeLabel(text, { scale: 0.0016, bg: 'rgba(0,0,0,0)' });
      lbl.position.z = 0.04;
      g.add(lbl);
      g.position.set(...at);
      if (opts.rotY) g.rotation.y = opts.rotY;
      api.click(box, () => {
        box.material.emissiveIntensity = 1.2;
        setTimeout(() => { box.material.emissiveIntensity = 0.35; }, 150);
        fn();
      });
      g.setText = (t) => { g.remove(lbl); lbl = makeLabel(t, { scale: 0.0016, bg: 'rgba(0,0,0,0)' }); lbl.position.z = 0.04; g.add(lbl); };
      scene.add(g);
      return g;
    },
    /** Табло: большая надпись, которую сцена обновляет (счётчик, формула). */
    board(text, at, opts = {}) {
      let s = makeLabel(text, { scale: opts.scale ?? 0.003 });
      s.position.set(...at);
      scene.add(s);
      return {
        sprite: s,
        set(t) { const n = makeLabel(t, { scale: opts.scale ?? 0.003 }); s.material.map = n.material.map; s.material.needsUpdate = true; s.scale.copy(n.scale); },
      };
    },
    teleport,
  };

  // #2 в адресе открывает вторую станцию — для превью и ссылок на конкретное место.
  const wanted = Number(location.hash.slice(1));
  teleport(stations[wanted >= 1 && wanted <= stations.length ? wanted - 1 : 0]);
  return api;
}

function buildHud({ title, hint, stations, renderer }) {
  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <a class="hud-back" href="/labs">← Лаборатории</a>
    <div class="hud-title">${title}</div>
    <div class="hud-hint">${hint}</div>
    <div class="hud-stations"></div>
    <div class="hud-actions"></div>
    <div class="hud-vr"></div>`;
  document.body.appendChild(root);
  const stBox = root.querySelector('.hud-stations');
  const actions = root.querySelector('.hud-actions');
  const vrBox = root.querySelector('.hud-vr');
  const vrBtn = VRButton.createButton(renderer);
  vrBtn.removeAttribute('style');
  vrBtn.className = 'hud-vrbtn';
  vrBox.appendChild(vrBtn);
  // VRButton пишет по-английски; переводим, не мешая ему обновлять текст.
  const ru = { 'ENTER VR': 'Войти в VR', 'EXIT VR': 'Выйти из VR', 'VR NOT SUPPORTED': 'VR недоступен',
    'VR NOT ALLOWED': 'VR запрещён', 'WEBXR NOT AVAILABLE': 'Нужен HTTPS для VR', 'WEBXR NEEDS HTTPS': 'Нужен HTTPS для VR' };
  new MutationObserver(() => {
    const t = vrBtn.textContent.trim();
    if (ru[t]) vrBtn.textContent = ru[t];
  }).observe(vrBtn, { childList: true, characterData: true, subtree: true });
  setTimeout(() => { const t = vrBtn.textContent.trim(); if (ru[t]) vrBtn.textContent = ru[t]; }, 300);

  const hud = { root, current: null, onStation: null,
    markStation(st) {
      hud.current = st;
      stBox.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.name === st.name));
      // Кнопки действий, привязанные к станции, видны только на ней.
      actions.querySelectorAll('button').forEach((b) => { if (b.dataset.station) b.hidden = b.dataset.station !== st.name; });
    },
    /** Кнопка действия для мыши; в VR та же операция живёт на 3D-кнопке. station — показывать только на этой станции. */
    action(label, fn, station) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.onclick = fn;
      if (station) { b.dataset.station = station; b.hidden = hud.current ? hud.current.name !== station : false; }
      actions.appendChild(b);
      return b;
    },
  };
  stations.forEach((st) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = st.name; b.dataset.name = st.name;
    b.onclick = () => hud.onStation?.(st);
    stBox.appendChild(b);
  });
  return hud;
}

/** Плавное «дыхание» для emissive-материалов. */
export function pulse(t, period = 2, lo = 0.4, hi = 1.0) {
  return lo + (hi - lo) * (0.5 + 0.5 * Math.sin((t / period) * Math.PI * 2));
}

