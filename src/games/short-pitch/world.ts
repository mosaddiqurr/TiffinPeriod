import {
  BoxGeometry, CanvasTexture, CapsuleGeometry, CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Fog, Group, HemisphereLight,
  IcosahedronGeometry, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry, Scene, SphereGeometry, SRGBColorSpace,
  TorusGeometry, type Material,
} from 'three';
import { FIELD } from './sim';

// The 3D para field for Short-Pitch Cricket, built from simple shapes
// (low-poly, no image files). Physics (x, h, y) maps to Three.js (x, h, −y):
// the batter's stumps are at the origin and the bowler is at z = −PITCH.

export const toV = (x: number, h: number, y: number): [number, number, number] => [x, h, -y];

const lam = (c: number | string) => new MeshLambertMaterial({ color: new Color(c) });

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// ---------- Players ----------

export interface Rig {
  root: Group;
  hips: Group;
  torso: Group;
  armL: Group; armR: Group;
  legL: Group; legR: Group;
  handR: Mesh;
  bat?: Group;
  shirt: MeshLambertMaterial;
  cap?: MeshLambertMaterial;
}

const blobGeo = new CircleGeometry(0.42, 16);
const blobMat = new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false });

/** A faceless player: a helmet for the batter, a cap for the fielders. No eyes, nose or mouth. */
export function makePlayer(shirt: string, opts: { helmet?: boolean; cap?: string; pads?: boolean; bat?: boolean; keeper?: boolean } = {}): Rig {
  const skin = lam('#b97a4f');
  const white = lam(opts.pads || opts.keeper ? '#f4f4ef' : '#e9e6dc');
  const shirtM = lam(shirt);
  const root = new Group();
  const blob = new Mesh(blobGeo, blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; root.add(blob);
  const hips = new Group(); hips.position.y = 0.92; root.add(hips);
  const torso = new Group(); hips.add(torso);
  const body = new Mesh(new CapsuleGeometry(0.17, 0.42, 4, 8), shirtM); body.position.y = 0.33; torso.add(body);
  const neck = new Mesh(new CylinderGeometry(0.05, 0.06, 0.08, 6), skin); neck.position.y = 0.66; torso.add(neck);
  const head = new Mesh(new SphereGeometry(0.12, 12, 10), skin); head.position.y = 0.8; torso.add(head);
  let capM: MeshLambertMaterial | undefined;
  if (opts.helmet) {
    const shell = new Mesh(new SphereGeometry(0.142, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), lam('#1c3f7a'));
    shell.position.y = 0.81; torso.add(shell);
    const peak = new Mesh(new BoxGeometry(0.2, 0.02, 0.1), lam('#1c3f7a')); peak.position.set(0, 0.86, 0.15); torso.add(peak);
    const grille = new Group(); grille.position.set(0, 0.76, 0.135); torso.add(grille);
    const steel = lam('#9aa3ad');
    for (const y of [-0.045, 0, 0.045]) { const bar = new Mesh(new BoxGeometry(0.21, 0.013, 0.013), steel); bar.position.y = y; grille.add(bar); }
    for (const x of [-0.065, 0.065]) { const bar = new Mesh(new BoxGeometry(0.013, 0.11, 0.013), steel); bar.position.x = x; grille.add(bar); }
  } else if (opts.cap) {
    capM = lam(opts.cap);
    const dome = new Mesh(new SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), capM); dome.position.y = 0.83; torso.add(dome);
    const brim = new Mesh(new CylinderGeometry(0.1, 0.1, 0.015, 12, 1, false, -Math.PI / 2, Math.PI), capM); brim.position.set(0, 0.835, 0.07); torso.add(brim);
  }
  const limb = (len: number, r: number, m: Material) => { const g = new Group(); const mesh = new Mesh(new CapsuleGeometry(r, len, 3, 6), m); mesh.position.y = -len / 2 - r; g.add(mesh); return g; };
  const armL = limb(0.5, 0.055, shirtM); armL.position.set(-0.24, 0.58, 0); torso.add(armL);
  const armR = limb(0.5, 0.055, shirtM); armR.position.set(0.24, 0.58, 0); torso.add(armR);
  const gloveM = opts.pads || opts.keeper ? lam('#f4f4ef') : skin;
  let handR: Mesh | null = null;
  for (const a of [armL, armR]) { const hand = new Mesh(new SphereGeometry(opts.keeper ? 0.085 : 0.06, 8, 6), gloveM); hand.position.y = -0.66; a.add(hand); if (a === armR) handR = hand; }
  const legL = limb(0.72, 0.075, white); legL.position.set(-0.1, 0, 0); hips.add(legL);
  const legR = limb(0.72, 0.075, white); legR.position.set(0.1, 0, 0); hips.add(legR);
  for (const l of [legL, legR]) {
    const shoe = new Mesh(new BoxGeometry(0.11, 0.07, 0.24), lam('#2b2b2b')); shoe.position.set(0, -0.88, 0.04); l.add(shoe);
    if (opts.pads) { const pad = new Mesh(new BoxGeometry(0.17, 0.48, 0.12), lam('#f9f9f4')); pad.position.set(0, -0.6, 0.06); l.add(pad); }
  }
  const rig: Rig = { root, hips, torso, armL, armR, legL, legR, handR: handR!, shirt: shirtM, cap: capM };
  if (opts.bat) {
    const bat = new Group();
    const blade = new Mesh(new BoxGeometry(0.11, 0.62, 0.045), lam('#d9b77a')); blade.position.y = -0.5; bat.add(blade);
    const grip = new Mesh(new CylinderGeometry(0.02, 0.02, 0.26, 6), lam('#b3262e')); grip.position.y = -0.08; bat.add(grip);
    bat.position.y = -0.62;
    armR.add(bat);
    rig.bat = bat;
  }
  return rig;
}

export function paintRig(r: Rig, shirt: string, cap?: string) {
  r.shirt.color.set(shirt);
  if (cap && r.cap) r.cap.color.set(cap);
}

function resetPose(r: Rig) {
  for (const g of [r.armL, r.armR, r.legL, r.legR, r.torso]) g.rotation.set(0, 0, 0);
  r.hips.position.y = 0.92;
  r.hips.rotation.set(0, 0, 0);
  if (r.bat) r.bat.rotation.set(0, 0, 0);
}

/** Running. `phase` grows with the distance run. */
export function poseRun(r: Rig, phase: number, amount: number) {
  resetPose(r);
  const s = Math.sin(phase) * amount;
  r.legL.rotation.x = s * 0.9; r.legR.rotation.x = -s * 0.9;
  r.armL.rotation.x = -s * 0.8; r.armR.rotation.x = s * 0.8;
  r.hips.position.y = 0.92 + Math.abs(Math.cos(phase)) * 0.05 * amount;
  r.torso.rotation.x = 0.15 * amount;
}

/** The fielders' "ready" crouch, with a small breathing bob. */
export function poseReady(r: Rig, crouch = 0.25, t = 0) {
  resetPose(r);
  r.legL.rotation.x = -crouch * 0.6; r.legR.rotation.x = -crouch * 0.6;
  r.legL.rotation.z = -0.12; r.legR.rotation.z = 0.12;
  r.torso.rotation.x = crouch + Math.sin(t * 2) * 0.02;
  r.armL.rotation.x = -0.6; r.armR.rotation.x = -0.6;
  r.hips.position.y = 0.92 - crouch * 0.15;
}

/** Arms up: a catch, a celebration or an appeal. */
export function poseArmsUp(r: Rig, t: number) {
  resetPose(r);
  r.armL.rotation.z = -2.7 + Math.sin(t * 9) * 0.15;
  r.armR.rotation.z = 2.7 - Math.sin(t * 9) * 0.15;
  r.hips.position.y = 0.92 + Math.max(0, Math.sin(t * 7)) * 0.12;
}

/** The wicketkeeper's crouch behind the stumps. `rise` 0..1 stands up. */
export function poseKeeper(r: Rig, rise: number) {
  resetPose(r);
  const c = 1 - rise;
  r.hips.position.y = 0.92 - c * 0.42;
  r.legL.rotation.x = -c * 1.3; r.legR.rotation.x = -c * 1.3;
  r.legL.rotation.z = -0.35 * c; r.legR.rotation.z = 0.35 * c;
  r.torso.rotation.x = 0.35 + c * 0.2;
  r.armL.rotation.x = -1.1; r.armR.rotation.x = -1.1;
  r.armL.rotation.z = 0.25; r.armR.rotation.z = -0.25;
}

/** The bowling action from a standing start. k: 0 = hold, 1 = follow-through. */
export function poseBowl(r: Rig, k: number) {
  resetPose(r);
  const e = Math.min(1, Math.max(0, k));
  // The bowling arm goes back, over the top, and down in front.
  r.armR.rotation.x = e * Math.PI * 2 * 0.92;
  // The front arm reaches up, then pulls down.
  r.armL.rotation.x = -Math.sin(Math.min(1, e * 1.6) * Math.PI) * 2.6;
  r.torso.rotation.x = -0.15 + e * 0.55;
  r.legL.rotation.x = -Math.sin(e * Math.PI) * 0.5;
  r.legR.rotation.x = Math.sin(e * Math.PI) * 0.3;
}

/** A throw: k 0..1. */
export function poseThrow(r: Rig, k: number) {
  resetPose(r);
  r.armR.rotation.x = Math.PI * (0.9 + k * 0.9);
  r.armL.rotation.x = -1.2;
  r.torso.rotation.x = k * 0.4;
}

export type BatKind = 'defend' | 'ground' | 'loft';

/**
 * The batter's stroke. `s` runs 0..1: 0 = stance, 0.35 = backlift at the top,
 * 0.55 = contact, 1 = follow-through. `side` is the aim (+ = off side).
 */
export function poseBat(r: Rig, s: number, kind: BatKind, side: number) {
  resetPose(r);
  const key = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, Math.max(0, k));
  const top = kind === 'defend' ? -0.9 : -2.1;
  const follow = kind === 'defend' ? 0.35 : kind === 'loft' ? 2.9 : 2.1;
  let phi: number;
  if (s < 0.35) phi = key(0.05, top, s / 0.35);
  else if (s < 0.55) phi = key(top, 0.15, (s - 0.35) / 0.2);
  else phi = key(0.15, follow, (s - 0.55) / 0.45);
  const through = Math.max(0, (s - 0.55) / 0.45);
  const theta = -0.5;
  r.armR.rotation.set(theta, 0, phi);
  r.armL.rotation.set(theta + 0.12, 0, phi - 0.15);
  r.torso.rotation.y = -side * 0.35 * through;
  r.torso.rotation.x = 0.28 - through * 0.15;
  r.hips.position.y = 0.86;
  r.legL.rotation.z = -0.18; r.legR.rotation.z = 0.18;
  // The front foot moves toward the ball for a drive.
  if (kind !== 'defend') r.legL.rotation.z = -0.18 - through * 0.2;
  else r.legL.rotation.z = -0.32;
  if (r.bat) r.bat.rotation.x = 0;
}

/** The batter carries the bat while running. */
export function poseCarryBat(r: Rig, phase: number) {
  poseRun(r, phase, 1);
  r.armR.rotation.set(-0.9, 0, 0);
}

// ---------- The field ----------

export interface World {
  scene: Scene;
  stumps: { near: Group; far: Group; nearBails: Mesh[]; farBails: Mesh[] };
  ball: Mesh;
  shadow: Mesh;
  /** A short tapered trail behind the ball in play (one draw call). */
  trail: InstancedMesh;
  marker: Mesh;
  zones: Group;
  aim: Mesh;
  board: { draw: (top: string, mid: string, low: string) => void };
}

const DUMMY = new Object3D();
export const TRAIL_N = 14;

/** Place the trail points (newest first); the spheres get smaller toward the tail. */
export function setTrail(t: InstancedMesh, pts: Array<[number, number, number]>) {
  const n = Math.min(TRAIL_N, pts.length);
  for (let i = 0; i < n; i++) {
    DUMMY.position.set(...pts[i]);
    DUMMY.rotation.set(0, 0, 0);
    DUMMY.scale.setScalar(1 - i / TRAIL_N);
    DUMMY.updateMatrix();
    t.setMatrixAt(i, DUMMY.matrix);
  }
  t.count = n;
  t.instanceMatrix.needsUpdate = true;
}

export function buildWorld(): World {
  const scene = new Scene();
  scene.background = new Color('#a4d4ee');
  scene.fog = new Fog('#d3e6ee', 48, 120);
  scene.add(new HemisphereLight('#ffffff', '#6f8f45', 1.55));
  const sun = new DirectionalLight('#fff0d0', 1.7);
  sun.position.set(-20, 35, 15);
  scene.add(sun);

  // Ground: mowing rings, a worn square around the pitch, and the rope
  const grass = canvasTex(512, 512, (g) => {
    for (let r = 256; r > 0; r -= 14) { g.fillStyle = Math.round(r / 14) % 2 ? '#82b648' : '#75aa3f'; g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.fill(); }
    // Bare, worn patches where the children stand every day
    g.fillStyle = 'rgba(160, 130, 80, 0.35)';
    for (const [x, y, r] of [[256, 230, 34], [256, 300, 22], [300, 180, 12], [215, 190, 10]] as const) { g.beginPath(); g.ellipse(x, y, r, r * 1.6, 0, 0, Math.PI * 2); g.fill(); }
  });
  const field = new Mesh(new CircleGeometry(FIELD.radius + 1.6, 72), new MeshLambertMaterial({ map: grass }));
  field.rotation.x = -Math.PI / 2;
  scene.add(field);
  const outer = new Mesh(new CircleGeometry(90, 48), lam('#8d7b5c'));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02;
  scene.add(outer);
  const rope = new Mesh(new TorusGeometry(FIELD.radius, 0.09, 6, 120), lam('#ffffff'));
  rope.rotation.x = Math.PI / 2; rope.position.y = 0.07;
  scene.add(rope);
  // Flags along the rope: Bangladesh green and red (one draw call)
  const flags = new InstancedMesh(new BoxGeometry(0.05, 0.7, 0.05), new MeshLambertMaterial(), 24);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    DUMMY.position.set(Math.cos(a) * FIELD.radius, 0.35, Math.sin(a) * FIELD.radius); DUMMY.rotation.set(0, 0, 0); DUMMY.scale.set(1, 1, 1); DUMMY.updateMatrix();
    flags.setMatrixAt(i, DUMMY.matrix); flags.setColorAt(i, new Color(i % 2 ? '#e0333f' : '#006a4e'));
  }
  scene.add(flags);

  // The short pitch with crease lines. It is centred between the stumps.
  const L = FIELD.pitch + 3;
  const pitchTex = canvasTex(64, 512, (g) => {
    g.fillStyle = '#c9a86a'; g.fillRect(0, 0, 64, 512);
    g.fillStyle = 'rgba(120, 90, 40, 0.18)'; for (let i = 0; i < 70; i++) g.fillRect((i * 37) % 64, (i * 71) % 512, 3, 3);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    const px = (m: number) => (m / L) * 512;
    // The popping creases, 1.2 m in front of each set of stumps
    for (const m of [1.5 + FIELD.crease, L - 1.5 - FIELD.crease]) g.fillRect(0, px(m) - 1.5, 64, 3);
    // The bowling creases, at the stumps
    for (const m of [1.5, L - 1.5]) g.fillRect(12, px(m) - 1, 40, 2);
  });
  const pitch = new Mesh(new PlaneGeometry(2.6, L), new MeshLambertMaterial({ map: pitchTex }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.set(0, 0.012, -FIELD.pitch / 2);
  scene.add(pitch);

  // Length zones for the bowler (shown only while the bowler aims)
  const zones = new Group();
  const zone = (from: number, to: number, color: string) => {
    const m = new Mesh(new PlaneGeometry(2.4, to - from), new MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.02, -(from + to) / 2);
    zones.add(m);
  };
  zone(0.5, 2.0, '#ffd23f');   // full
  zone(2.0, 4.2, '#2ecc71');   // good length
  zone(4.2, 7.5, '#e0333f');   // short
  zones.visible = false;
  scene.add(zones);

  // The aim arrow on the grass in front of the batter
  const arrowTex = canvasTex(64, 256, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.moveTo(32, 0); g.lineTo(62, 70); g.lineTo(42, 70); g.lineTo(42, 256); g.lineTo(22, 256); g.lineTo(22, 70); g.lineTo(2, 70); g.closePath(); g.fill();
  });
  const aim = new Mesh(new PlaneGeometry(0.7, 2.8), new MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false, opacity: 0.75, side: DoubleSide }));
  aim.rotation.order = 'YXZ';
  aim.visible = false;
  scene.add(aim);

  // Stumps
  const mkStumps = () => {
    const g = new Group();
    const m = lam('#f1ead6');
    for (const x of [-0.1, 0, 0.1]) { const s = new Mesh(new CylinderGeometry(0.018, 0.018, 0.71, 6), m); s.position.set(x, 0.355, 0); g.add(s); }
    const bails: Mesh[] = [];
    for (const x of [-0.05, 0.05]) { const b = new Mesh(new BoxGeometry(0.1, 0.022, 0.022), lam('#d9a441')); b.position.set(x, 0.72, 0); g.add(b); bails.push(b); }
    return { g, bails };
  };
  const near = mkStumps(); scene.add(near.g);
  const far = mkStumps(); far.g.position.z = -FIELD.pitch; scene.add(far.g);

  // Para houses (one draw call), water tanks, a boundary wall, trees and poles
  const colors = ['#f2c6a0', '#e8d7a6', '#c9dfc1', '#f0b8b8', '#bcd3e8', '#e6c9e8', '#f3e1b5'];
  const winTex = canvasTex(64, 128, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 128);
    for (let y = 10; y < 128; y += 32) for (let x = 8; x < 64; x += 28) { g.fillStyle = '#2f7d55'; g.fillRect(x, y, 18, 20); g.fillStyle = '#bcdcf0'; g.fillRect(x + 3, y + 3, 12, 14); }
  });
  const N = 22;
  const houses = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ map: winTex }), N);
  const tanks = new InstancedMesh(new CylinderGeometry(0.9, 0.9, 1.6, 10), lam('#1d1d1d'), 8);
  let ti = 0;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.07;
    const r = 41 + (i % 3) * 6;
    const h = 7 + ((i * 7) % 4) * 2.5;
    const w = 8 + (i % 4) * 1.5;
    DUMMY.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    DUMMY.scale.set(w, h, 7);
    DUMMY.rotation.set(0, 0, 0);
    DUMMY.lookAt(0, h / 2, 0);
    DUMMY.updateMatrix();
    houses.setMatrixAt(i, DUMMY.matrix);
    houses.setColorAt(i, new Color(colors[i % colors.length]));
    if (i % 3 === 0 && ti < 8) {
      DUMMY.scale.set(1, 1, 1); DUMMY.position.y = h + 0.8; DUMMY.updateMatrix();
      tanks.setMatrixAt(ti++, DUMMY.matrix);
    }
  }
  tanks.count = ti;
  scene.add(houses, tanks);
  const wall = new Mesh(new TorusGeometry(31, 0.5, 4, 72), lam('#d9d2c3'));
  wall.rotation.x = Math.PI / 2; wall.position.y = 0.5;
  scene.add(wall);
  // Krishnachura trees with red flowers
  const treeSpots: Array<[number, number]> = [[-28, -22], [30, -14], [-33, 12], [27, 24], [9, 34], [-14, -33]];
  const trunks = new InstancedMesh(new CylinderGeometry(0.4, 0.55, 4, 7), lam('#6b4a2b'), treeSpots.length);
  const crowns = new InstancedMesh(new IcosahedronGeometry(3.4, 1), lam('#4f8a3a'), treeSpots.length);
  const flowers = new InstancedMesh(new SphereGeometry(0.3, 5, 4), lam('#ea4a1f'), treeSpots.length * 16);
  treeSpots.forEach(([x, z], i) => {
    DUMMY.rotation.set(0, i, 0); DUMMY.scale.set(1, 1, 1);
    DUMMY.position.set(x, 2, z); DUMMY.updateMatrix(); trunks.setMatrixAt(i, DUMMY.matrix);
    DUMMY.position.set(x, 5.6, z); DUMMY.updateMatrix(); crowns.setMatrixAt(i, DUMMY.matrix);
    for (let k = 0; k < 16; k++) {
      const a = k * 2.4 + i, e = (k % 5) * 0.35 - 0.6;
      DUMMY.position.set(x + Math.cos(a) * 3.15 * Math.cos(e), 5.6 + Math.sin(e) * 3.15, z + Math.sin(a) * 3.15 * Math.cos(e));
      DUMMY.updateMatrix(); flowers.setMatrixAt(i * 16 + k, DUMMY.matrix);
    }
  });
  scene.add(trunks, crowns, flowers);
  const poles = new InstancedMesh(new CylinderGeometry(0.15, 0.2, 9, 6), lam('#8a8f96'), 4);
  [0.6, 2.2, 3.9, 5.3].forEach((a, i) => { DUMMY.rotation.set(0, 0, 0); DUMMY.position.set(Math.cos(a) * 35, 4.5, Math.sin(a) * 35); DUMMY.updateMatrix(); poles.setMatrixAt(i, DUMMY.matrix); });
  scene.add(poles);

  // A chalk scoreboard behind the keeper, and the national flag beside it
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 512; boardCanvas.height = 256;
  const boardTex = new CanvasTexture(boardCanvas);
  boardTex.colorSpace = SRGBColorSpace;
  const boardG = new Group();
  const boardFace = new Mesh(new PlaneGeometry(5.2, 2.6), new MeshBasicMaterial({ map: boardTex }));
  boardFace.position.y = 2.4;
  boardG.add(boardFace);
  const frame = new Mesh(new BoxGeometry(5.5, 2.9, 0.12), lam('#7a4a22')); frame.position.set(0, 2.4, -0.08); boardG.add(frame);
  for (const x of [-2.3, 2.3]) { const leg = new Mesh(new BoxGeometry(0.16, 1.2, 0.16), lam('#7a4a22')); leg.position.set(x, 0.6, -0.1); boardG.add(leg); }
  boardG.position.set(-4, 0, 29);
  boardG.rotation.y = Math.PI + Math.atan2(-4, 29) * 0.2;
  scene.add(boardG);
  const flagTex = canvasTex(160, 96, (g) => { g.fillStyle = '#006a4e'; g.fillRect(0, 0, 160, 96); g.fillStyle = '#f42a41'; g.beginPath(); g.arc(72, 48, 29, 0, Math.PI * 2); g.fill(); });
  const flagPole = new Mesh(new CylinderGeometry(0.06, 0.06, 6, 6), lam('#d0d0d0')); flagPole.position.set(2.2, 3, 29.4); scene.add(flagPole);
  const flag = new Mesh(new PlaneGeometry(1.6, 0.96), new MeshBasicMaterial({ map: flagTex, side: DoubleSide })); flag.position.set(1.38, 5.4, 29.4); flag.rotation.y = Math.PI; scene.add(flag);
  const drawBoard = (top: string, mid: string, low: string) => {
    const g = boardCanvas.getContext('2d')!;
    g.fillStyle = '#23302a'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % 512, (i * 53) % 256, 40, 2);
    g.fillStyle = '#f3f1e7'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 40px "Baloo Da 2", sans-serif'; g.fillText(top, 256, 52);
    g.font = '800 92px "Baloo Da 2", sans-serif'; g.fillText(mid, 256, 140);
    g.font = '600 34px "Baloo Da 2", sans-serif'; g.fillStyle = '#ffd23f'; g.fillText(low, 256, 218);
    boardTex.needsUpdate = true;
  };
  drawBoard('', '0/0', '');

  // Ball, its shadow, and the bowling target marker
  const ball = new Mesh(new SphereGeometry(0.11, 14, 10), lam('#e6e24a'));
  scene.add(ball);
  const shadow = new Mesh(new CircleGeometry(0.13, 16), new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  const marker = new Mesh(new TorusGeometry(0.22, 0.045, 6, 24), new MeshBasicMaterial({ color: '#e0333f' }));
  marker.rotation.x = Math.PI / 2; marker.position.y = 0.035; marker.visible = false;
  scene.add(marker);
  const trail = new InstancedMesh(new SphereGeometry(0.09, 8, 6), new MeshBasicMaterial({ color: '#fff7b0', transparent: true, opacity: 0.45, depthWrite: false }), TRAIL_N);
  trail.count = 0;
  trail.frustumCulled = false;
  scene.add(trail);
  return { scene, stumps: { near: near.g, far: far.g, nearBails: near.bails, farBails: far.bails }, ball, shadow, trail, marker, zones, aim, board: { draw: drawBoard } };
}
