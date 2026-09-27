import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Colores estándar (esquema occidental)
const FACES = [
  { key: 'R', normal: [1, 0, 0], color: 0xc8102e },
  { key: 'L', normal: [-1, 0, 0], color: 0xff6a13 },
  { key: 'U', normal: [0, 1, 0], color: 0xf5f5f5 },
  { key: 'D', normal: [0, -1, 0], color: 0xffd200 },
  { key: 'F', normal: [0, 0, 1], color: 0x00a651 },
  { key: 'B', normal: [0, 0, -1], color: 0x0051ba },
];

const AXES = ['x', 'y', 'z'];
const ALL = [-1, 0, 1];

// q = cuartos de vuelta en sentido positivo (regla de la mano derecha) sobre el eje
export const NOTATION = {
  R: { axis: 'x', layers: [1], q: -1 },
  L: { axis: 'x', layers: [-1], q: 1 },
  M: { axis: 'x', layers: [0], q: 1 },
  x: { axis: 'x', layers: ALL, q: -1 },
  U: { axis: 'y', layers: [1], q: -1 },
  D: { axis: 'y', layers: [-1], q: 1 },
  E: { axis: 'y', layers: [0], q: 1 },
  y: { axis: 'y', layers: ALL, q: -1 },
  F: { axis: 'z', layers: [1], q: -1 },
  B: { axis: 'z', layers: [-1], q: 1 },
  S: { axis: 'z', layers: [0], q: -1 },
  z: { axis: 'z', layers: ALL, q: -1 },
  // Giros dobles (cara + capa central)
  r: { axis: 'x', layers: [0, 1], q: -1 },
  l: { axis: 'x', layers: [-1, 0], q: 1 },
  u: { axis: 'y', layers: [0, 1], q: -1 },
  d: { axis: 'y', layers: [-1, 0], q: 1 },
  f: { axis: 'z', layers: [0, 1], q: -1 },
  b: { axis: 'z', layers: [-1, 0], q: 1 },
};

const layersKey = (layers) => [...layers].sort().join(',');

export function moveFromNotation(name, prime = false) {
  const base = NOTATION[name];
  if (!base) return null;
  return { axis: base.axis, layers: base.layers, q: prime ? -base.q : base.q };
}

export function moveName(move) {
  const key = layersKey(move.layers);
  for (const [name, def] of Object.entries(NOTATION)) {
    if (def.axis !== move.axis || layersKey(def.layers) !== key) continue;
    if (Math.abs(move.q) === 2) return name + '2';
    return move.q === def.q ? name : name + "'";
  }
  return '?';
}

const invert = (m) => ({ ...m, q: -m.q });

// Normaliza q a {-1, 1, 2}; 0 = sin movimiento
const normQ = (q) => {
  const r = ((q % 4) + 4) % 4;
  return r === 0 ? 0 : r === 1 ? 1 : r === 2 ? 2 : -1;
};

function roundedRectShape(size, radius) {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + radius, -h);
  s.lineTo(h - radius, -h);
  s.quadraticCurveTo(h, -h, h, -h + radius);
  s.lineTo(h, h - radius);
  s.quadraticCurveTo(h, h, h - radius, h);
  s.lineTo(-h + radius, h);
  s.quadraticCurveTo(-h, h, -h, h - radius);
  s.lineTo(-h, -h + radius);
  s.quadraticCurveTo(-h, -h, -h + radius, -h);
  return s;
}

export class RubikCube {
  constructor(container, { onChange } = {}) {
    this.container = container;
    this.onChange = onChange;

    this.queue = [];
    this.current = null;
    this.history = []; // movimientos registrados (mezcla + usuario), para resolver
    this.userMoves = 0;
    this.locked = false; // true mientras se mezcla o resuelve
    this.drag = null;
    this.lastMoves = [];

    this._initScene();
    this._buildCube();
    this._bindEvents();

    this.renderer.setAnimationLoop((t) => this._tick(t));
  }

  // ---------- Escena ----------

  _initScene() {
    const { clientWidth: w, clientHeight: h } = this.container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
    this.camera.position.set(5.8, 5.1, 8.3);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.9;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 18;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(5, 8, 6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(-6, -3, -5);
    this.scene.add(fill);

    this.group = new THREE.Group();
    this.pivot = new THREE.Group();
    this.scene.add(this.group, this.pivot);

    this.raycaster = new THREE.Raycaster();

    this.resizeObserver = new ResizeObserver(() => this._resize());
    this.resizeObserver.observe(this.container);
  }

  _buildCube() {
    const bodyGeo = new RoundedBoxGeometry(0.97, 0.97, 0.97, 3, 0.1);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.6 });
    const stickerGeo = new THREE.ShapeGeometry(roundedRectShape(0.82, 0.12), 4);
    const stickerMats = Object.fromEntries(
      FACES.map((f) => [
        f.key,
        new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.35, metalness: 0.05 }),
      ]),
    );
    const zAxis = new THREE.Vector3(0, 0, 1);

    this.cubies = [];
    this.stickers = [];

    for (const x of ALL) {
      for (const y of ALL) {
        for (const z of ALL) {
          const cubie = new THREE.Mesh(bodyGeo, bodyMat);
          cubie.position.set(x, y, z);
          cubie.userData.cubie = cubie;
          const pos = { x, y, z };

          for (const f of FACES) {
            const n = new THREE.Vector3(...f.normal);
            // Solo pegatinas en caras exteriores
            if (pos.x * n.x + pos.y * n.y + pos.z * n.z !== 1) continue;
            const sticker = new THREE.Mesh(stickerGeo, stickerMats[f.key]);
            sticker.position.copy(n).multiplyScalar(0.487);
            sticker.quaternion.setFromUnitVectors(zAxis, n);
            sticker.userData.cubie = cubie;
            sticker.userData.face = f.key;
            cubie.add(sticker);
            this.stickers.push(sticker);
          }

          this.group.add(cubie);
          this.cubies.push(cubie);
        }
      }
    }
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  resetView() {
    this.camera.position.set(5.8, 5.1, 8.3);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  // ---------- Movimientos ----------

  /** Movimiento del usuario (teclado / ratón). */
  move(move) {
    if (this.locked || !move) return;
    this._enqueue(move, { record: true, user: true, duration: 150 });
    this.userMoves++;
    this._emit();
  }

  undo() {
    if (this.locked) return;
    const idx = this.history.findLastIndex((h) => h.user);
    if (idx === -1 || idx !== this.history.length - 1) return;
    const { move } = this.history.pop();
    this._enqueue(invert(move), { record: false, user: true, duration: 150 });
    this.userMoves = Math.max(0, this.userMoves - 1);
    this.lastMoves.pop();
    this._emit();
  }

  scramble(length = 25) {
    if (this.locked) return;
    this.flush();
    const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
    let prevAxis = null;
    let prevPrevAxis = null;
    let prevFace = null;
    for (let i = 0; i < length; i++) {
      let face;
      do {
        face = faces[Math.floor(Math.random() * 6)];
        const ax = NOTATION[face].axis;
        // Evita repetir cara y tres giros seguidos sobre el mismo eje
        if (face === prevFace) continue;
        if (ax === prevAxis && ax === prevPrevAxis) continue;
        break;
      } while (true);
      const r = Math.random();
      const base = NOTATION[face];
      const q = r < 1 / 3 ? base.q : r < 2 / 3 ? -base.q : 2;
      const move = { axis: base.axis, layers: base.layers, q };
      this._enqueue(move, { record: true, user: false, duration: 70 });
      prevPrevAxis = prevAxis;
      prevAxis = base.axis;
      prevFace = face;
    }
    this.locked = true;
    this.userMoves = 0;
    this.lastMoves = [];
    this._emit();
  }

  solve() {
    if (this.locked) return;
    this.flush();
    // Invierte el historial y fusiona giros consecutivos de la misma capa
    const stack = [];
    for (let i = this.history.length - 1; i >= 0; i--) {
      const m = invert(this.history[i].move);
      const top = stack[stack.length - 1];
      if (top && top.axis === m.axis && layersKey(top.layers) === layersKey(m.layers)) {
        const q = normQ(top.q + m.q);
        if (q === 0) stack.pop();
        else top.q = q;
      } else {
        stack.push({ ...m, q: normQ(m.q) });
      }
    }
    this.history = [];
    this.userMoves = 0;
    this.lastMoves = [];
    if (stack.length === 0) {
      this._emit();
      return;
    }
    const duration = Math.max(45, Math.min(110, 3000 / stack.length));
    for (const m of stack) this._enqueue(m, { record: false, user: false, duration });
    this.locked = true;
    this._emit();
  }

  _enqueue(move, { record, user, duration }) {
    if (record) {
      this.history.push({ move, user });
      if (user) {
        this.lastMoves.push(moveName(move));
        if (this.lastMoves.length > 14) this.lastMoves.shift();
      }
    }
    this.queue.push({ move, user, duration });
  }

  /** Completa al instante todas las animaciones pendientes. */
  flush() {
    while (this.current || this.queue.length) {
      if (!this.current) this._startNext(performance.now());
      this._finishCurrent();
    }
  }

  _startNext(now) {
    const item = this.queue.shift();
    const { axis, layers } = item.move;
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrixWorld();
    const cubies = this.cubies.filter((c) => layers.includes(Math.round(c.position[axis])));
    for (const c of cubies) this.pivot.attach(c);
    // Si hay cola de movimientos del usuario, acelera para no ir con retraso
    let duration = item.duration * (Math.abs(item.move.q) === 2 ? 1.4 : 1);
    if (item.user && this.queue.length > 1) duration *= 0.5;
    this.current = { item, cubies, start: now, duration };
  }

  _finishCurrent() {
    const { item, cubies } = this.current;
    const { axis, q } = item.move;
    this.pivot.rotation[axis] = (q * Math.PI) / 2;
    this.pivot.updateMatrixWorld();
    const m = new THREE.Matrix4();
    for (const c of cubies) {
      this.group.attach(c);
      c.position.set(Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z));
      m.makeRotationFromQuaternion(c.quaternion);
      const e = m.elements;
      for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) e[i] = Math.round(e[i]);
      c.quaternion.setFromRotationMatrix(m);
    }
    this.pivot.rotation.set(0, 0, 0);
    this.current = null;

    if (!this.queue.length) {
      const wasLocked = this.locked;
      this.locked = false;
      this._emit({ settled: true, byUser: item.user && !wasLocked });
    }
  }

  _tick(now) {
    if (!this.current && this.queue.length) this._startNext(now);
    if (this.current) {
      const { start, duration, item } = this.current;
      const t = Math.min(1, (now - start) / duration);
      if (t >= 1) {
        this._finishCurrent();
        if (this.queue.length) this._startNext(now);
      } else {
        const eased = 1 - Math.pow(1 - t, 3);
        this.pivot.rotation[item.move.axis] = ((item.move.q * Math.PI) / 2) * eased;
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  isSolved() {
    this.group.updateMatrixWorld(true);
    const seen = {};
    const n = new THREE.Vector3();
    for (const s of this.stickers) {
      n.set(0, 0, 1).transformDirection(s.matrixWorld);
      const key = `${Math.round(n.x)},${Math.round(n.y)},${Math.round(n.z)}`;
      if (seen[key] === undefined) seen[key] = s.userData.face;
      else if (seen[key] !== s.userData.face) return false;
    }
    return true;
  }

  _emit(extra = {}) {
    const busy = !!this.current || this.queue.length > 0;
    this.onChange?.({
      moves: this.userMoves,
      lastMoves: [...this.lastMoves],
      locked: this.locked,
      solved: busy ? null : this.isSolved(),
      canUndo: !this.locked && this.history.length > 0 && this.history[this.history.length - 1].user,
      ...extra,
    });
  }

  // ---------- Ratón / táctil ----------

  _bindEvents() {
    this._onDown = (e) => this._pointerDown(e);
    this._onMove = (e) => this._pointerMove(e);
    this._onUp = () => this._pointerUp();
    // Fase de captura en el contenedor: decidimos antes que OrbitControls
    this.container.addEventListener('pointerdown', this._onDown, true);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
  }

  _raycast(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(this.cubies, true)[0] || null;
  }

  _pointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!this._raycast(e)) return; // fondo -> OrbitControls gira la vista

    e.stopPropagation();
    if (this.locked) return;
    this.flush();
    const hit = this._raycast(e);
    if (!hit) return;

    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const ai = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
    const idx = ai.indexOf(Math.max(...ai));
    const normal = new THREE.Vector3();
    normal.setComponent(idx, Math.sign(n.getComponent(idx)));

    this.drag = {
      x: e.clientX,
      y: e.clientY,
      normal,
      point: hit.point.clone(),
      cubie: hit.object.userData.cubie,
      done: false,
    };
  }

  _pointerMove(e) {
    const d = this.drag;
    if (!d || d.done) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) < 10) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const drag = new THREE.Vector2(dx, dy).normalize();
    const p0 = d.point.clone().project(this.camera);

    // Elige la dirección 3D (tangente a la cara) que mejor encaja con el arrastre en pantalla
    let best = null;
    let bestDot = -Infinity;
    for (let i = 0; i < 3; i++) {
      if (d.normal.getComponent(i) !== 0) continue;
      for (const s of [1, -1]) {
        const dir = new THREE.Vector3();
        dir.setComponent(i, s);
        const p1 = d.point.clone().addScaledVector(dir, 0.5).project(this.camera);
        const screen = new THREE.Vector2(
          ((p1.x - p0.x) * rect.width) / 2,
          (-(p1.y - p0.y) * rect.height) / 2,
        ).normalize();
        const dot = screen.dot(drag);
        if (dot > bestDot) {
          bestDot = dot;
          best = dir;
        }
      }
    }

    // Eje de giro: normal × dirección  (así el punto se desplaza hacia "dir")
    const axisVec = d.normal.clone().cross(best);
    const i = [0, 1, 2].find((k) => Math.round(axisVec.getComponent(k)) !== 0);
    const axis = AXES[i];
    const q = Math.sign(axisVec.getComponent(i));
    const layer = Math.round(d.cubie.position[axis]);

    d.done = true;
    this.move({ axis, layers: [layer], q });
  }

  _pointerUp() {
    this.drag = null;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.container.removeEventListener('pointerdown', this._onDown, true);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
