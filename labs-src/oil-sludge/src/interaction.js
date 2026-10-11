// Ввод: лучи контроллеров/рук (pinch = select) в WebXR и мышь на ПК.
// Цели:
//   • панели — UV → виджет; за заголовок панель можно перенести;
//   • термопары — захват и перенос;
//   • объекты с userData.handler = { down, drag, up, hover, leave } — ручки, рычаги, сечение, щуп по образцу.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Vector3();

export class Interaction {
  constructor({ renderer, camera, scene, dolly, controls }) {
    this.renderer = renderer;
    this.camera = camera;
    this.controls = controls;
    this.dolly = dolly;
    this.targets = [];
    this.ray = new THREE.Raycaster();
    this.pointers = [];
    this.onFirstGesture = null;
    this.onClick = null; // звук щелчка
    this.grips = {};     // по стороне: 'left' / 'right' → объект grip

    // --- XR ---
    const cmf = new XRControllerModelFactory();
    const hmf = new XRHandModelFactory();
    for (let i = 0; i < 2; i++) {
      const ctrl = renderer.xr.getController(i);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
      line.scale.z = 2;
      ctrl.add(line);
      const cursor = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.01, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
      cursor.renderOrder = 999;
      cursor.visible = false;
      scene.add(cursor);
      const grip = renderer.xr.getControllerGrip(i);
      const ptr = { id: `xr${i}`, src: ctrl, grip, line, cursor, connected: false, pressed: false, capture: null, grab: null, hover: null };
      ctrl.addEventListener('connected', (e) => {
        ptr.connected = true; ptr.hand = !!e.data.hand; ptr.handedness = e.data.handedness; ptr.gamepad = e.data.gamepad;
        this.grips[e.data.handedness] = grip;
      });
      ctrl.addEventListener('disconnected', () => {
        ptr.connected = false; ptr.cursor.visible = false; this.release(ptr);
        if (this.grips[ptr.handedness] === grip) delete this.grips[ptr.handedness];
      });
      ctrl.addEventListener('selectstart', () => this.down(ptr));
      ctrl.addEventListener('selectend', () => this.up(ptr));
      dolly.add(ctrl);
      grip.add(cmf.createControllerModel(grip));
      dolly.add(grip);
      const hand = renderer.xr.getHand(i);
      hand.add(hmf.createHandModel(hand, 'mesh'));
      dolly.add(hand);
      this.pointers.push(ptr);
    }

    // --- мышь ---
    const mouse = { id: 'mouse', ndc: new THREE.Vector2(-9, -9), connected: true, pressed: false, capture: null, grab: null, hover: null, isMouse: true };
    this.mouse = mouse;
    const el = renderer.domElement;
    const setNdc = (e) => {
      const r = el.getBoundingClientRect();
      mouse.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    el.addEventListener('pointermove', (e) => { setNdc(e); });
    el.addEventListener('pointerleave', () => { mouse.ndc.set(-9, -9); });
    el.addEventListener('pointerdown', (e) => {
      this.onFirstGesture?.();
      if (e.button !== 0) return;
      setNdc(e);
      this.cast(mouse);
      if (mouse.hit) { controls.enabled = false; this.down(mouse); }
    }, { capture: true });
    window.addEventListener('pointerup', () => { if (mouse.pressed) this.up(mouse); controls.enabled = true; });
    this.pointers.push(mouse);

    this.snapReady = true;
  }

  add(obj) { this.targets.push(obj); }

  head(out = new THREE.Vector3()) {
    const cam = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
    return cam.getWorldPosition(out);
  }
  viewDir(out = new THREE.Vector3()) {
    const cam = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
    return cam.getWorldDirection(out);
  }

  setRay(ptr) {
    if (ptr.isMouse) this.ray.setFromCamera(ptr.ndc, this.camera);
    else this.ray.setFromXRController(ptr.src);
  }

  cast(ptr) {
    this.setRay(ptr);
    const list = ptr.capture ? [ptr.capture.mesh] : this.targets;
    const hits = this.ray.intersectObjects(list, false);
    // свою панель на запястье этот же контроллер не «видит»
    ptr.hit = hits.find((h) => {
      const u = h.object.userData;
      if (u.owner && u.owner === ptr.handedness) return false;
      if (u.handler?.accept && !u.handler.accept(h)) return false;
      return h.object.visible !== false || u.probe;
    }) ?? null;
    return ptr.hit;
  }

  pulse(ptr, strength = 0.35, ms = 25) {
    try { ptr.gamepad?.hapticActuators?.[0]?.pulse?.(strength, ms); } catch { /* нет вибрации */ }
  }

  // точка луча на плоскости, проходящей через p0 перпендикулярно взгляду
  rayOnViewPlane(p0, out) {
    const n = this.viewDir(_n);
    const denom = this.ray.ray.direction.dot(n);
    if (Math.abs(denom) < 1e-4) return null;
    const t = _q.copy(p0).sub(this.ray.ray.origin).dot(n) / denom;
    return t > 0 ? this.ray.ray.at(t, out) : null;
  }

  down(ptr) {
    if (!ptr.isMouse) this.onFirstGesture?.();
    ptr.pressed = true;
    const h = this.cast(ptr);
    if (!h) return;
    const u = h.object.userData;
    if (u.panel) {
      const r = u.panel.pointer('down', h.uv, ptr.id);
      if (r === 'move') {
        ptr.move = { panel: u.panel, p0: h.point.clone(), start: u.panel.mesh.position.clone() };
        this.pulse(ptr, 0.2, 15);
      } else ptr.capture = u.panel;
    } else if (u.probe) {
      ptr.grab = { probe: u.probe, dist: h.distance, offset: u.probe.group.position.clone().sub(h.point) };
      u.probe.grabbed = true;
      this.pulse(ptr, 0.3, 20);
    } else if (u.handler) {
      ptr.handler = u.handler;
      ptr.dragP0 = h.point.clone();
      u.handler.down?.(h, ptr, this);
      this.pulse(ptr, 0.3, 20);
      this.onClick?.();
    }
  }

  up(ptr) {
    ptr.pressed = false;
    if (ptr.capture) {
      const wasButton = ptr.capture.active?.kind === 'button';
      const h = this.cast(ptr);
      if (h) ptr.capture.pointer('up', h.uv, ptr.id); else ptr.capture.release();
      if (wasButton && h) { this.pulse(ptr); this.onClick?.(); }
      ptr.capture = null;
    }
    if (ptr.grab) { ptr.grab.probe.grabbed = false; ptr.grab = null; }
    if (ptr.handler) { ptr.handler.up?.(ptr, this); ptr.handler = null; }
    if (ptr.move) { ptr.move.panel.onMoved?.(); ptr.move = null; }
  }

  release(ptr) {
    ptr.capture?.release(); ptr.capture = null;
    if (ptr.grab) { ptr.grab.probe.grabbed = false; ptr.grab = null; }
    if (ptr.handler) { ptr.handler.up?.(ptr, this); ptr.handler = null; }
    ptr.move = null;
  }

  update(dt) {
    const xr = this.renderer.xr.isPresenting;
    // сначала перемещение, затем актуальные мировые матрицы контроллеров (иначе луч отстаёт на кадр)
    if (xr) { this.locomotion(dt); this.dolly.updateMatrixWorld(true); }
    for (const ptr of this.pointers) {
      if (ptr.isMouse ? xr : !ptr.connected || !xr) {
        if (ptr.cursor) ptr.cursor.visible = false;
        if (ptr.hoverHandler) { ptr.hoverHandler.leave?.(ptr, this); ptr.hoverHandler = null; }
        continue;
      }
      // перенос панели: точка луча на плоскости взгляда, панель поворачивается к пользователю
      if (ptr.move) {
        this.setRay(ptr);
        const p = this.rayOnViewPlane(ptr.move.p0, _v);
        if (p) {
          const m = ptr.move.panel.mesh;
          m.position.copy(ptr.move.start).add(p).sub(ptr.move.p0);
          m.position.y = Math.max(0.6, m.position.y);
          const head = this.head(_q);
          m.lookAt(head.x, m.position.y, head.z);
        }
        if (ptr.cursor) ptr.cursor.visible = false;
        continue;
      }
      if (ptr.grab) {
        this.setRay(ptr);
        const p = this.ray.ray.at(ptr.grab.dist, _v).add(ptr.grab.offset);
        p.y = Math.max(p.y, 0.95);
        ptr.grab.probe.group.position.copy(p);
        if (ptr.line) ptr.line.scale.z = ptr.grab.dist;
        if (ptr.cursor) ptr.cursor.visible = false;
        continue;
      }
      if (ptr.handler) {
        this.setRay(ptr);
        ptr.handler.drag?.(ptr, this);
        if (ptr.cursor) ptr.cursor.visible = false;
        continue;
      }
      const h = this.cast(ptr);
      const u = h?.object.userData;
      const panel = u?.panel;
      if (ptr.hover && ptr.hover !== panel) ptr.hover.leave(ptr.id);
      ptr.hover = panel ?? null;
      if (panel && h.uv) panel.pointer('move', h.uv, ptr.id);
      const handler = u?.handler ?? null;
      if (ptr.hoverHandler && ptr.hoverHandler !== handler) ptr.hoverHandler.leave?.(ptr, this);
      ptr.hoverHandler = handler;
      if (handler) handler.hover?.(h, ptr, this);
      if (ptr.isMouse) {
        let cur = 'default';
        if (h) cur = u.probe || u.handler?.cursor === 'grab' || (panel && panel.isTitle?.(h.uv)) ? 'grab' : 'pointer';
        this.renderer.domElement.style.cursor = cur;
      } else {
        ptr.line.scale.z = h ? h.distance : 2;
        ptr.cursor.visible = !!h;
        if (h) {
          ptr.cursor.position.copy(h.point);
          const n = h.face ? _n.copy(h.face.normal).transformDirection(h.object.matrixWorld) : _n.set(0, 0, 1);
          ptr.cursor.lookAt(_v.copy(h.point).add(n));
          ptr.cursor.position.addScaledVector(n, 0.002);
        }
      }
    }
  }

  // левый стик — перемещение, правый — поворот на 30°
  locomotion(dt) {
    const session = this.renderer.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp || gp.axes.length < 4) continue;
      const x = gp.axes[2], y = gp.axes[3];
      if (src.handedness === 'left') {
        if (Math.hypot(x, y) > 0.15) {
          const dir = this.viewDir(_v);
          dir.y = 0; dir.normalize();
          const right = _n.set(-dir.z, 0, dir.x);
          this.dolly.position.addScaledVector(dir, -y * 1.2 * dt).addScaledVector(right, x * 1.2 * dt);
        }
      } else if (src.handedness === 'right') {
        if (Math.abs(x) > 0.7 && this.snapReady) {
          this.snapReady = false;
          const head = this.head(_q);
          const ang = -Math.sign(x) * Math.PI / 6;
          const d = _v.copy(this.dolly.position).sub(head).applyAxisAngle(_n.set(0, 1, 0), ang);
          this.dolly.position.copy(head).add(d);
          this.dolly.rotation.y += ang;
        } else if (Math.abs(x) < 0.3) this.snapReady = true;
      }
    }
  }
}

// Перетаскивание вдоль оси: значение = v0 + (смещение точки луча вдоль axis)·scale
export function axisDrag({ axis, scale, get, set, onStep }) {
  const p = new THREE.Vector3();
  return {
    cursor: 'grab',
    down(h, ptr) { ptr.drag0 = { v: get(), p0: h.point.clone() }; },
    drag(ptr, ia) {
      const q = ia.rayOnViewPlane(ptr.drag0.p0, p);
      if (!q) return;
      const ax = typeof axis === 'function' ? axis() : axis;
      const d = q.sub(ptr.drag0.p0).dot(ax);
      const before = get();
      set(ptr.drag0.v + d * scale);
      if (onStep && get() !== before) { onStep(); ia.pulse(ptr, 0.12, 8); }
    },
  };
}
