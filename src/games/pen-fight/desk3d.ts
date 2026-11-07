import {
  ACESFilmicToneMapping, AdditiveBlending, BackSide, BoxGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Fog,
  Group, HemisphereLight, Material, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera,
  Plane, PlaneGeometry, Raycaster, RepeatWrapping, RingGeometry, SRGBColorSpace, Scene, Shape, ShapeGeometry, SphereGeometry, Texture, TorusGeometry,
  Vector2, Vector3, WebGLRenderer,
} from 'three';
import { DESK, type PenId } from './model';

// The desk in 3D (Three.js): an old wooden school bench seen close up, warm window light,
// soft shadows, and two real-looking pens. Desk units are centimetres, the desk top is y = 0,
// model x → three x and model y → three z.

export const KIT = [
  { cap: '#1f5fc4', ink: '#1f4fbf', glow: '#ffd23f' },
  { cap: '#d62839', ink: '#c0182b', glow: '#ffd23f' },
];

const std = (color: string, rough = 0.5, metal = 0) => new MeshStandardMaterial({ color, roughness: rough, metalness: metal });

/** A pen lying on its side, long axis along +x, centred on its balance point. The cap is at +x. */
export function makePen(id: PenId, cap: string, ink: string, len: number, r: number): Group {
  const g = new Group();
  const along = (geo: CylinderGeometry) => { geo.rotateZ(Math.PI / 2); return geo; };
  const add = (geo: CylinderGeometry | SphereGeometry | BoxGeometry | TorusGeometry, mat: Material, x: number, y = 0, z = 0) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const capMat = new MeshPhysicalMaterial({ color: cap, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  if (id === 'classic') {
    // The classic six-sided white ballpoint: hexagonal barrel lying on a flat face, coloured cap with a clip, coloured end plug.
    const body = new MeshPhysicalMaterial({ color: '#f4f4ef', roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.35 });
    const barrel = along(new CylinderGeometry(r, r, len * 0.74, 6));
    barrel.rotateX(Math.PI / 6);
    add(barrel, body, -len * 0.13);
    // Ink tube shadow line along the barrel (a faint stripe on top).
    add(along(new CylinderGeometry(r * 0.3, r * 0.3, len * 0.66, 8)), new MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.18 }), -len * 0.13, r * 0.72);
    add(along(new CylinderGeometry(r * 1.13, r * 1.08, len * 0.3, 18)), capMat, len * 0.35);
    add(new SphereGeometry(r * 1.08, 16, 10), capMat, len * 0.5 - r * 0.2).scale.set(0.45, 1, 1);
    add(new BoxGeometry(len * 0.24, r * 0.26, r * 0.55), capMat, len * 0.33, r * 1.28);
    add(new SphereGeometry(r * 0.32, 10, 8), capMat, len * 0.22, r * 1.25);
    add(along(new CylinderGeometry(r * 0.78, r * 0.92, len * 0.035, 12)), capMat, -len * 0.5 + len * 0.017);
  } else {
    // The gel pen: clear smoky barrel with the ink refill inside, black ribbed rubber grip, coloured cap, chrome clip.
    const clear = new MeshPhysicalMaterial({ color: '#cfd8e3', roughness: 0.12, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.08, depthWrite: false });
    add(along(new CylinderGeometry(r, r * 0.96, len * 0.62, 20)), clear, -len * 0.19);
    add(along(new CylinderGeometry(r * 0.36, r * 0.36, len * 0.7, 10)), std(ink, 0.4), -len * 0.15);
    const rubber = std('#1b1d21', 0.9);
    add(along(new CylinderGeometry(r * 1.07, r * 1.07, len * 0.2, 20)), rubber, len * 0.12);
    for (let i = 0; i < 7; i++) add(new TorusGeometry(r * 1.07, r * 0.07, 6, 18), rubber, len * 0.035 + i * len * 0.027).rotation.y = Math.PI / 2;
    add(along(new CylinderGeometry(r * 1.16, r * 1.1, len * 0.27, 20)), capMat, len * 0.365);
    add(new SphereGeometry(r * 1.12, 16, 10), capMat, len * 0.5 - r * 0.25).scale.set(0.5, 1, 1);
    const chrome = std('#e8ecf0', 0.18, 1);
    add(new BoxGeometry(len * 0.22, r * 0.2, r * 0.5), chrome, len * 0.36, r * 1.33);
    add(along(new CylinderGeometry(r * 1.17, r * 1.17, len * 0.02, 20)), chrome, len * 0.23);
    add(along(new CylinderGeometry(r * 0.85, r, len * 0.04, 16)), capMat, -len * 0.5 + len * 0.02);
  }
  return g;
}

/** A soft glow round a pen (back faces of a slightly bigger rod), for "this is your pen". */
function makeGlow(len: number, r: number, color: string): Mesh {
  const geo = new CylinderGeometry(r + 0.42, r + 0.42, len + 0.9, 18);
  geo.rotateZ(Math.PI / 2);
  const m = new Mesh(geo, new MeshBasicMaterial({ color, side: BackSide, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }));
  return m;
}

function woodTexture(): CanvasTexture {
  const W = 2048, H = 1252;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const base = g.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#b47a43'); base.addColorStop(0.5, '#a76d38'); base.addColorStop(1, '#9a6131');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // Planks
  const planks = 3;
  for (let p = 0; p < planks; p++) {
    const y0 = (p * H) / planks;
    g.fillStyle = `rgba(${p % 2 ? 255 : 60}, ${p % 2 ? 220 : 30}, ${p % 2 ? 170 : 0}, 0.05)`;
    g.fillRect(0, y0, W, H / planks);
    for (let i = 0; i < 70; i++) {
      const yy = y0 + (i / 70) * (H / planks);
      g.strokeStyle = `rgba(70, 38, 14, ${0.05 + ((i * 37) % 11) / 110})`;
      g.lineWidth = 1 + ((i * 13) % 4);
      g.beginPath(); g.moveTo(0, yy);
      for (let x = 0; x <= W; x += 64) g.lineTo(x, yy + Math.sin(x / 260 + i * 1.7 + p) * 6 + Math.sin(x / 47 + i) * 1.5);
      g.stroke();
    }
    g.fillStyle = 'rgba(40, 20, 6, 0.55)'; g.fillRect(0, y0 - 2, W, 4);
  }
  // Knots
  for (const [x, y, r] of [[420, 260, 26], [1500, 980, 34], [1700, 300, 18]] as const) {
    for (let k = 6; k > 0; k--) { g.strokeStyle = `rgba(60, 30, 10, ${0.12 + k * 0.04})`; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, r * k * 0.5, r * k * 0.28, 0.1, 0, 6.283); g.stroke(); }
  }
  // Carvings, ink and scratches from years of students
  g.save();
  g.translate(1520, 560); g.rotate(-0.06);
  g.font = '700 82px "Baloo Da 2", "Hind Siliguri", sans-serif';
  g.lineWidth = 6; g.strokeStyle = 'rgba(55, 28, 8, 0.55)'; g.strokeText('রাফি + সজীব', 0, 0);
  g.fillStyle = 'rgba(230, 190, 140, 0.25)'; g.fillText('রাফি + সজীব', 3, 3);
  g.restore();
  g.save(); g.translate(330, 980); g.rotate(0.12); g.font = '700 54px sans-serif'; g.lineWidth = 4; g.strokeStyle = 'rgba(55, 28, 8, 0.45)'; g.strokeText('SSC 2009', 0, 0); g.restore();
  g.strokeStyle = 'rgba(55, 28, 8, 0.4)'; g.lineWidth = 3;
  for (const [x, y, r] of [[1100, 240, 70], [1100, 240, 40]] as const) { g.beginPath(); g.arc(x, y, r, 0, 6.283); g.stroke(); }
  g.beginPath(); g.moveTo(1100, 240); g.lineTo(1170, 240); g.stroke();
  g.fillStyle = 'rgba(28, 52, 160, 0.5)';
  for (const [x, y, r] of [[700, 640, 22], [722, 652, 9], [1830, 760, 15]] as const) { g.beginPath(); g.ellipse(x, y, r * 1.4, r, 0.3, 0, 6.283); g.fill(); }
  g.strokeStyle = 'rgba(28, 52, 160, 0.35)'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(860, 1080); g.bezierCurveTo(940, 1040, 980, 1110, 1060, 1060); g.stroke();
  g.strokeStyle = 'rgba(255, 235, 200, 0.12)'; g.lineWidth = 2;
  for (let i = 0; i < 60; i++) { const x = (i * 337) % W, y = (i * 611) % H, l = 20 + ((i * 7) % 60); g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + ((i % 5) - 2) * 3); g.stroke(); }
  // Worn, slightly lighter middle where elbows rest
  const wear = g.createRadialGradient(W / 2, H * 0.62, 50, W / 2, H * 0.62, W * 0.55);
  wear.addColorStop(0, 'rgba(255, 220, 170, 0.12)'); wear.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = wear; g.fillRect(0, 0, W, H);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function wallTexture(): CanvasTexture {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9cba6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#7d9a8a'; g.fillRect(0, H * 0.72, W, H * 0.28);
  // Blackboard with the day's chalk
  g.fillStyle = '#5a3a1e'; g.fillRect(170, 70, 560, 250);
  g.fillStyle = '#26402f'; g.fillRect(182, 82, 536, 226);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = '600 34px "Baloo Da 2", sans-serif'; g.fillText('তারিখ: ১২/০৩', 210, 130);
  g.font = '600 30px "Baloo Da 2", sans-serif'; g.fillText('বাড়ির কাজ: অনুশীলনী ৫', 210, 180);
  g.fillText('(a + b)² = a² + 2ab + b²', 210, 235);
  // Window light
  g.fillStyle = 'rgba(255, 244, 205, 0.85)'; g.fillRect(800, 60, 170, 260);
  g.strokeStyle = '#6b5a3a'; g.lineWidth = 8; g.strokeRect(800, 60, 170, 260);
  g.beginPath(); g.moveTo(885, 60); g.lineTo(885, 320); g.moveTo(800, 190); g.lineTo(970, 190); g.stroke();
  // Fan shadow and a calendar
  g.fillStyle = '#f2ead6'; g.fillRect(60, 120, 70, 90); g.fillStyle = '#c0392b'; g.fillRect(60, 120, 70, 20);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function floorTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#8c8676' : '#9a9483'; g.fillRect(i * 64, j * 64, 64, 64); }
  g.strokeStyle = 'rgba(40,35,25,0.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(10, 10);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export interface PenView { root: Group; body: Group; glow: Mesh; len: number; r: number }

/** The whole 3D view: renderer, camera, room, desk, pens and the aiming marks. */
export class DeskView {
  renderer: WebGLRenderer;
  scene = new Scene();
  camera = new PerspectiveCamera(36, 1, 1, 900);
  pens: PenView[] = [];
  private ray = new Raycaster();
  private plane = new Plane(new Vector3(0, 1, 0), 0);
  private v2 = new Vector2();
  private v3 = new Vector3();
  /** Aim marks on the desk. */
  aim = new Group();
  grabRing: Mesh;
  band: Mesh;
  arrow: Mesh;
  path: Mesh[] = [];
  hitRing: Mesh;
  portrait = false;
  /** 0 → normal framing, 1 → a little closer (while aiming). */
  zoom = 0;
  private focus = new Vector3();

  constructor(host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = SRGBColorSpace;
    const cv = this.renderer.domElement;
    cv.style.display = 'block'; cv.style.width = '100%'; cv.style.height = '100%'; cv.style.touchAction = 'none';
    cv.setAttribute('aria-label', '3D school desk');
    host.appendChild(cv);
    this.build();
    this.grabRing = new Mesh(new RingGeometry(0.9, 1.45, 40), new MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.95, depthWrite: false }));
    this.grabRing.rotation.x = -Math.PI / 2;
    this.band = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide }));
    this.band.rotation.x = -Math.PI / 2;
    const s = new Shape();
    s.moveTo(0, -0.55); s.lineTo(0.78, -0.55); s.lineTo(0.78, -1.25); s.lineTo(1, 0); s.lineTo(0.78, 1.25); s.lineTo(0.78, 0.55); s.lineTo(0, 0.55); s.closePath();
    this.arrow = new Mesh(new ShapeGeometry(s), new MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.95, depthWrite: false, side: DoubleSide }));
    this.arrow.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 26; i++) {
      const d = new Mesh(new CircleGeometry(0.42, 14), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
      d.rotation.x = -Math.PI / 2;
      this.path.push(d);
      this.aim.add(d);
    }
    this.hitRing = new Mesh(new RingGeometry(1.1, 1.6, 36), new MeshBasicMaterial({ color: '#ff6b5a', transparent: true, opacity: 0.9, depthWrite: false }));
    this.hitRing.rotation.x = -Math.PI / 2;
    for (const m of [this.band, this.arrow, this.grabRing, this.hitRing]) { m.renderOrder = 5; this.aim.add(m); }
    this.aim.position.y = 0.06;
    this.aim.visible = false;
    this.scene.add(this.aim);
  }

  private build() {
    const sc = this.scene;
    sc.background = new Color('#2d2318');
    sc.fog = new Fog('#2d2318', 140, 420);
    const hemi = new HemisphereLight('#fff1d6', '#3a2a1a', 0.85);
    sc.add(hemi);
    const sun = new DirectionalLight('#ffe2b0', 2.3);
    sun.position.set(-38, 90, -30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -55; sun.shadow.camera.right = 55; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
    sun.shadow.camera.near = 20; sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
    sc.add(sun);
    const fill = new DirectionalLight('#bcd2ff', 0.35);
    fill.position.set(40, 50, 60);
    sc.add(fill);

    // Desk top: 72 × 44 cm, 2.6 cm thick, worn edges.
    const top = new Mesh(new BoxGeometry(DESK.w, 2.6, DESK.d), [
      std('#7a4a22', 0.7), std('#7a4a22', 0.7), new MeshStandardMaterial({ map: woodTexture(), roughness: 0.62 }), std('#5e3517', 0.8), std('#8a5a2c', 0.7), std('#8a5a2c', 0.7),
    ]);
    top.position.y = -1.3;
    top.receiveShadow = true; top.castShadow = true;
    sc.add(top);
    // Edge trim highlight so the edge reads clearly
    const trim = std('#c89a63', 0.5);
    for (const [w, d, x, z] of [[DESK.w + 0.4, 0.5, 0, DESK.d / 2], [DESK.w + 0.4, 0.5, 0, -DESK.d / 2], [0.5, DESK.d, DESK.w / 2, 0], [0.5, DESK.d, -DESK.w / 2, 0]] as const) {
      const m = new Mesh(new BoxGeometry(w, 0.35, d), trim);
      m.position.set(x, -0.15, z);
      m.receiveShadow = true;
      sc.add(m);
    }
    // Under-desk shelf, iron frame and legs
    const iron = std('#2f3338', 0.55, 0.6);
    const shelf = new Mesh(new BoxGeometry(DESK.w - 6, 1.2, DESK.d - 10), std('#6b4020', 0.8));
    shelf.position.set(0, -13, -3);
    sc.add(shelf);
    for (const x of [-DESK.w / 2 + 3, DESK.w / 2 - 3]) for (const z of [-DESK.d / 2 + 3, DESK.d / 2 - 3]) {
      const leg = new Mesh(new BoxGeometry(2.4, 74, 2.4), iron);
      leg.position.set(x, -38, z);
      leg.castShadow = true;
      sc.add(leg);
    }
    // Bench seat in front
    const seat = new Mesh(new BoxGeometry(DESK.w + 10, 3, 26), std('#8c5a2b', 0.7));
    seat.position.set(0, -30, DESK.d / 2 + 22);
    seat.receiveShadow = true;
    sc.add(seat);
    // Floor, the next desks and the classroom wall
    const floor = new Mesh(new PlaneGeometry(900, 900), new MeshStandardMaterial({ map: floorTexture(), roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -75;
    floor.receiveShadow = true;
    sc.add(floor);
    const wall = new Mesh(new PlaneGeometry(520, 260), new MeshStandardMaterial({ map: wallTexture(), roughness: 0.95 }));
    wall.position.set(0, 40, -230);
    sc.add(wall);
    // A few things on the desk edge: an eraser and a sharpener (out of play, beyond the far corners)
    const eraser = new Mesh(new BoxGeometry(4, 1, 2), std('#f0f0ea', 0.9));
    eraser.position.set(-DESK.w / 2 + 6, 0.5, -DESK.d / 2 + 3.2);
    eraser.rotation.y = 0.4;
    eraser.castShadow = true;
    sc.add(eraser);
  }

  addPen(id: PenId, side: number, len: number, r: number) {
    const k = KIT[side];
    const root = new Group();
    const body = makePen(id, k.cap, k.ink, len, r);
    const glow = makeGlow(len, r, k.glow);
    glow.visible = false;
    root.add(body, glow);
    this.scene.add(root);
    this.pens.push({ root, body, glow, len, r });
  }

  /** Place pen i at a desk pose. `lift` raises it (falling). */
  placePen(i: number, x: number, y: number, a: number) {
    const p = this.pens[i];
    p.root.position.set(x, p.r, y);
    p.root.rotation.set(0, -a, 0);
  }

  /** Screen point → desk point (cm), or null. */
  deskPoint(clientX: number, clientY: number): [number, number] | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.v2.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.v2, this.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, this.v3);
    return hit ? [hit.x, hit.z] : null;
  }

  /** Desk point → screen point (CSS px inside the canvas). */
  screenPoint(x: number, y: number, h = 0): [number, number] {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.v3.set(x, h, y).project(this.camera);
    return [((this.v3.x + 1) / 2) * r.width, ((1 - this.v3.y) / 2) * r.height];
  }

  setFocus(x: number, y: number) { this.focus.set(x, 0, y); }

  /** Frame the desk so it nearly fills the screen; in portrait the long side runs up the screen. */
  frame() {
    const cv = this.renderer.domElement;
    const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
    const aspect = w / h;
    this.portrait = aspect < 0.95;
    const elev = (this.portrait ? 54 : 58) * (Math.PI / 180);
    const across = this.portrait ? DESK.d : DESK.w;
    const deep = this.portrait ? DESK.w : DESK.d;
    const vf = (this.camera.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    // Distance so the desk width fits, and so its depth (seen at an angle) fits.
    const margin = this.portrait ? 1.03 : 0.99;
    const dW = ((across / 2) * margin) / Math.tan(hf / 2) + (deep / 2) * Math.cos(elev);
    const dD = ((deep / 2) * Math.sin(elev) * margin * 1.02) / Math.tan(vf / 2) + (deep / 2) * Math.cos(elev);
    let dist = Math.max(dW, dD);
    dist *= 1 - this.zoom * 0.08;
    const cx = this.focus.x * this.zoom * 0.18, cz = this.focus.z * this.zoom * 0.18;
    // Look a touch beyond the centre so the near edge is not cut by the HUD.
    if (this.portrait) {
      this.camera.position.set(cx + dist * Math.cos(elev), dist * Math.sin(elev), cz);
      this.camera.lookAt(cx + 3.5, 0, cz);
    } else {
      this.camera.position.set(cx, dist * Math.sin(elev), cz + dist * Math.cos(elev));
      this.camera.lookAt(cx, 0, cz - 1.5);
    }
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const cv = this.renderer.domElement;
    const host = cv.parentElement!;
    const r = host.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    this.camera.aspect = Math.max(1, r.width) / Math.max(1, r.height);
    this.camera.updateProjectionMatrix();
    this.frame();
  }

  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    const seen = new Set<unknown>();
    this.scene.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      if (!seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); }
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        const map = (mat as Material & { map?: Texture | null }).map;
        if (map) map.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
