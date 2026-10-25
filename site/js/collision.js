// Proton-proton collision event: particles fly out of the origin, bend in the magnetic fields
// and stop (or not) in the real sub-detectors of the model.  1 unit = 0.1 m.
import * as THREE from '../vendor/three.module.min.js';
import { PARTICLES } from './info.js';

const R_ID = 22.6, R_EM = 32.6, R_CAL = 43, Z_ID = 29.5, Z_BAR = 30.5, Z_EC_EM = 49, Z_EC = 70.5;
const R_TOR0 = 47, R_TOR1 = 104, Z_TOR = 126, R_MU = 118;

const rnd = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 0.58;

function region(p) {
  const r = Math.hypot(p.x, p.y), z = Math.abs(p.z);
  if (r < R_ID && z < Z_ID) return 'id';
  if (r < R_CAL && z < Z_BAR) return r < R_EM ? 'em' : 'had';
  if (r < R_CAL && z < Z_EC) return 'end';
  return 'out';
}

/** integrate a charged/neutral track; returns {pts:[Vector3], stop:'em'|'had'|'muon'|'out', end:Vector3} */
function trace(kind, charge, pGeV, eta, phi) {
  const theta = 2 * Math.atan(Math.exp(-eta));
  const u = new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta));
  const pos = new THREE.Vector3(rnd(-.05, .05), rnd(-.05, .05), rnd(-.4, .4));
  const pts = [pos.clone()];
  const ds = 0.8;                                    // units per step (0.08 m)
  let stop = 'out';
  for (let i = 0; i < 700; i++) {
    const r = Math.hypot(pos.x, pos.y), az = Math.abs(pos.z);
    let B = null;
    if (r < R_ID && az < Z_ID) B = new THREE.Vector3(0, 0, 2.0);                 // solenoid
    else if (kind === 'mu' && r > R_TOR0 && r < R_TOR1 && az < Z_TOR) {          // barrel toroid ~ B_phi
      B = new THREE.Vector3(-pos.y / r, pos.x / r, 0).multiplyScalar(0.55);
    }
    if (B && charge) {
      const dsM = ds * 0.1;
      const k = 0.2998 * charge * dsM / pGeV;
      u.add(new THREE.Vector3().crossVectors(u, B).multiplyScalar(k)).normalize();
    }
    pos.addScaledVector(u, ds);
    pts.push(pos.clone());
    const reg = region(pos);
    if (kind === 'e' || kind === 'g') {
      if (reg === 'em' && Math.hypot(pos.x, pos.y) > R_ID + 4 + rnd(0, 3)) { stop = 'em'; break; }
      if (reg === 'end' && az > Z_BAR + rnd(2, 8)) { stop = 'em'; break; }
    }
    if (kind === 'h') {
      if (reg === 'had' && Math.hypot(pos.x, pos.y) > R_EM + 4 + rnd(0, 4)) { stop = 'had'; break; }
      if (reg === 'end' && az > Z_BAR + rnd(10, 28)) { stop = 'had'; break; }
    }
    if (kind === 'mu') { if (r > R_MU || az > Z_TOR + 40) { stop = 'muon'; break; } }
    if (kind === 'nu') { if (r > R_MU || az > Z_TOR + 60) { stop = 'out'; break; } }
    if (r > 135 || az > 200) break;
  }
  return { pts, stop, end: pos.clone(), dir: u.clone() };
}

export class EventSim {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.items = [];                // animated things
    this.t = 0; this.active = false; this.speed = 1;
    this.flashLight = new THREE.PointLight(0xffffff, 0, 400); this.group.add(this.flashLight);
    const sg = new THREE.SphereGeometry(1, 24, 16);
    this.shock = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.group.add(this.shock);
    this.sparks = null;
  }

  clear() {
    for (const it of this.items) { it.obj.parent?.remove(it.obj); it.obj.geometry?.dispose(); }
    this.items = []; this.active = false;
    this.shock.material.opacity = 0; this.flashLight.intensity = 0;
    if (this.sparks) { this.group.remove(this.sparks); this.sparks = null; }
  }

  /** build a list of particles for a named event */
  static makeEvent(name) {
    const P = [];
    const lep = (k, ch, p, eta, phi) => P.push({ kind: k, charge: ch, p, eta, phi });
    const soft = n => { for (let i = 0; i < n; i++) lep('h', Math.random() < .5 ? 1 : -1, rnd(1.5, 6), rnd(-2.4, 2.4), rnd(-Math.PI, Math.PI)); };
    const jet = (p, eta, phi, n = 9) => {
      for (let i = 0; i < n; i++) {
        const f = Math.random();
        const pp = p * (f * f * 0.5 + 0.03), e = eta + gauss() * 0.12, ph = phi + gauss() * 0.12;
        if (Math.random() < 0.28) { lep('g', 0, pp, e, ph); lep('g', 0, pp * .7, e + gauss() * .05, ph + gauss() * .05); }
        else lep('h', Math.random() < .5 ? 1 : -1, Math.max(pp, 2.5), e, ph);
      }
    };
    const ph = () => rnd(-Math.PI, Math.PI);
    switch (name) {
      case 'higgs4mu': {
        const a = ph(); const E = [[a, rnd(-1.8, 1.8)], [a + rnd(.8, 2.2), rnd(-1.8, 1.8)], [a + Math.PI + rnd(-.6, .6), rnd(-1.8, 1.8)], [a + Math.PI + rnd(.6, 1.6), rnd(-1.8, 1.8)]];
        [[-1, 38], [1, 27], [-1, 18], [1, 11]].forEach(([c, p], i) => lep('mu', c, p, E[i][1], E[i][0]));
        soft(14); break; }
      case 'zee': { const a = ph(), e1 = rnd(-1.5, 1.5);
        lep('e', -1, 46, e1, a); lep('e', 1, 44, rnd(-1.5, 1.5), a + Math.PI + rnd(-.25, .25)); soft(16); break; }
      case 'hgg': { const a = ph();
        lep('g', 0, 62, rnd(-1.4, 1.4), a); lep('g', 0, 58, rnd(-1.4, 1.4), a + Math.PI + rnd(-.3, .3)); soft(18); break; }
      case 'wmunu': { const a = ph();
        lep('mu', -1, 38, rnd(-1.8, 1.8), a); lep('nu', 0, 36, rnd(-1.5, 1.5), a + Math.PI + rnd(-.4, .4)); soft(14); break; }
      case 'dijet': { const a = ph(); jet(160, rnd(-1.2, 1.2), a, 11); jet(150, rnd(-1.2, 1.2), a + Math.PI + rnd(-.2, .2), 11); soft(10); break; }
      case 'ttbar': { const a = ph();
        jet(90, rnd(-1.5, 1.5), a, 8); jet(80, rnd(-1.5, 1.5), a + 1.9, 8); jet(70, rnd(-1.5, 1.5), a + 3.6, 7);
        lep('mu', 1, 45, rnd(-1.6, 1.6), a + 5.0); lep('nu', 0, 40, rnd(-1.5, 1.5), a + 2.6); soft(8); break; }
      case 'susy': { const a = ph();
        jet(220, rnd(-1.2, 1.2), a, 12); jet(200, rnd(-1.2, 1.2), a + 1.2, 12); jet(130, rnd(-1.5, 1.5), a + 2.6, 9);
        lep('nu', 0, 180, rnd(-1, 1), a + 4.1); lep('nu', 0, 90, rnd(-1, 1), a + 4.6); soft(10); break; }
      default: soft(34); lep('mu', 1, 14, rnd(-2, 2), ph()); lep('e', -1, 12, rnd(-2, 2), ph());
    }
    return P;
  }

  fire(name) {
    this.clear();
    const evt = EventSim.makeEvent(name);
    this.summary = [];
    let met = new THREE.Vector2();
    for (const p of evt) {
      const tr = trace(p.kind, p.charge, p.p, p.eta, p.phi);
      const col = PARTICLES[p.kind === 'h' ? 'h' : p.kind].color;
      const geo = new THREE.BufferGeometry().setFromPoints(tr.pts);
      let line;
      if (p.kind === 'g' || p.kind === 'nu') {
        line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: col, dashSize: 3, gapSize: 2.5, transparent: true, opacity: .95 }));
        line.computeLineDistances();
      } else {
        line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: p.p < 3 ? .55 : .95 }));
      }
      geo.setDrawRange(0, 0);
      this.group.add(line);
      const it = { obj: line, tr, p, n: tr.pts.length, born: 0, kind: p.kind };
      this.items.push(it);
      // deposits
      if (tr.stop === 'em' || tr.stop === 'had') this.tower(tr.end, tr.dir, p.p, tr.stop, it);
      if (tr.stop === 'muon' || p.kind === 'mu') this.muonHits(tr.pts, it);
      if (p.kind === 'nu') met.add(new THREE.Vector2(Math.cos(p.phi), Math.sin(p.phi)).multiplyScalar(p.p));
      const pt = p.p / Math.cosh(p.eta);
      if (p.p > 8 || p.kind === 'nu') this.summary.push({ ...p, pt, stop: tr.stop });
    }
    this.met = met.length();
    this.shockStart();
    this.t = 0; this.active = true;
    return this.summary.sort((a, b) => b.pt - a.pt);
  }

  tower(end, dir, p, where, owner) {
    const h = Math.min(3 + p * 0.35, 22);
    const g = new THREE.BoxGeometry(2.4, 2.4, h);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: where === 'em' ? 0x2dff7a : 0xff9a1f, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(end).addScaledVector(dir, h / 2 - 1.5);
    m.lookAt(end.clone().add(dir)); m.scale.set(0, 0, 0);
    this.group.add(m);
    this.items.push({ obj: m, follows: owner, kind: 'tower', h });
  }

  muonHits(pts, owner) {
    for (const rr of [54, 80, 111]) {
      const i = pts.findIndex(q => Math.hypot(q.x, q.y) > rr);
      if (i < 1) continue;
      const q = pts[i];
      const m = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.5, 4.5), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: .95, blending: THREE.AdditiveBlending }));
      m.position.copy(q); m.scale.set(0, 0, 0); this.group.add(m);
      this.items.push({ obj: m, follows: owner, at: i, kind: 'hit' });
    }
  }

  shockStart() {
    const n = 500, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(rnd(.3, 1.6)); vel.push(v); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff1c2, size: 2.6, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparks.userData.vel = vel; this.group.add(this.sparks);
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt * this.speed;
    const t = this.t;
    // flash + shock wave
    const f = Math.max(0, 1 - t / 0.9);
    this.flashLight.intensity = 9000 * f * f; this.flashLight.color.set(0xffeebb);
    this.shock.scale.setScalar(2 + t * 70); this.shock.material.opacity = Math.max(0, .55 * (1 - t / 0.8));
    if (this.sparks) {
      const pa = this.sparks.geometry.attributes.position, vel = this.sparks.userData.vel;
      for (let i = 0; i < vel.length; i++) pa.setXYZ(i, vel[i].x * t * 60, vel[i].y * t * 60, vel[i].z * t * 60);
      pa.needsUpdate = true; this.sparks.material.opacity = Math.max(0, 1 - t / 1.1);
    }
    const FLY = 150;                               // units per second of animation
    for (const it of this.items) {
      if (it.kind === 'tower' || it.kind === 'hit') continue;
      const shown = Math.min(it.n, Math.max(0, Math.floor((t - 0.12) * FLY / 0.8)));
      it.obj.geometry.setDrawRange(0, shown); it.shown = shown;
    }
    for (const it of this.items) {
      if (it.kind === 'tower') { const done = it.follows.shown >= it.follows.n; const s = it.obj.scale.z; const tgt = done ? 1 : 0; const k = s + (tgt - s) * Math.min(1, dt * 7); it.obj.scale.set(k, k, k); }
      if (it.kind === 'hit') { const done = it.follows.shown > it.at; const s = it.obj.scale.x; const k = s + ((done ? 1 : 0) - s) * Math.min(1, dt * 12); it.obj.scale.setScalar(k); }
    }
  }
}
