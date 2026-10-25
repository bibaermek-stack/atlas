import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { buildLayout, SYSTEMS } from './layout.js';
import { INFO, PARTICLES } from './info.js';
import { EventSim } from './collision.js';

const $ = s => document.querySelector(s);
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141a21);
scene.fog = new THREE.Fog(0x141a21, 900, 2400);
const camera = new THREE.PerspectiveCamera(36, 1, 1, 6000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .07; controls.maxDistance = 1800; controls.minDistance = 40;
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4350, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 2.3); sun.position.set(300, 500, -400); scene.add(sun);
const fillL = new THREE.DirectionalLight(0x88aaff, .9); fillL.position.set(-400, -100, 300); scene.add(fillL);

const q = new URLSearchParams(location.search);
const [cx, cy, cz] = (q.get('cam') || '520,330,-760').split(',').map(Number);
camera.position.set(cx, cy, cz); controls.target.set(0, 0, 0);

// ------------------------------------------------------------------ mesh data
const idx = await (await fetch('models/parts.json')).json();
const buf = await (await fetch('models/parts.bin')).arrayBuffer();
const byId = Object.fromEntries(idx.map(p => [p.id.slice(0, 8), p]));
const geoms = {};
function geom(id) {
  if (geoms[id]) return geoms[id];
  const p = byId[id]; if (!p) throw new Error('mesh ' + id);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, p.voff, p.nv * 3), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, p.toff, p.nt * 3), 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return geoms[id] = g;
}
const dimsOf = id => { const p = byId[id]; return [0, 1, 2].map(i => p.max[i] - p.min[i]); };

// ------------------------------------------------------------------ assemble
const world = new THREE.Group(); scene.add(world);
const parts = buildLayout(dimsOf);
const clip = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)];
const mats = {};                      // per system materials list for opacity/clip control
const MAG = { default: 60 };
for (const p of parts) {
  const base = p.tint ?? SYSTEMS[p.sys].color;
  const mat = new THREE.MeshStandardMaterial({ color: base, flatShading: true, roughness: .62, metalness: .12, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const m = new THREE.Mesh(p.mesh === 'box' ? new THREE.BoxGeometry(...p.box) : geom(p.mesh), mat);
  m.matrixAutoUpdate = false; m.matrix.copy(p.mat); world.add(m);
  m.userData.part = p; p.obj = m; p.base = new THREE.Color(base); p.mat0 = p.mat.clone();
  p.off = new THREE.Vector3(...p.explode);
  (mats[p.sys] ||= []).push(mat);
}
const state = { explode: 0, cut: true, xray: false, hidden: {}, speed: 1 };
function applyExplode() {
  const t = state.explode, e = t * t * (3 - 2 * t);
  for (const p of parts) {
    const off = p.off.clone().multiplyScalar(e);
    p.obj.matrix.copy(p.mat0).premultiply(new THREE.Matrix4().makeTranslation(off.x, off.y, off.z));
    p.obj.matrixWorldNeedsUpdate = true;
  }
}
const CLIPPED = new Set(['muon', 'toroid', 'bw', 'ect', 'sw', 'feet']);
function applyStyle() {
  for (const p of parts) {
    const m = p.obj.material;
    m.clippingPlanes = state.cut && CLIPPED.has(p.sys) ? clip : [];
    m.clipIntersection = true;
    const xr = state.xray;
    m.opacity = xr ? ({ id: .55, calo: .3 }[p.sys] ?? .12) : 1; m.depthWrite = !xr;
    p.obj.visible = !state.hidden[p.sys];
    m.needsUpdate = true;
  }
}
applyExplode(); applyStyle();

// ------------------------------------------------------------------ UI
const ui = $('#ui');
ui.innerHTML = `
<header><b>ATLAS</b><span>CERN · 1:100 3D симуляция</span></header>
<aside id="left">
  <h3>Детектор жүйелері</h3>
  <div id="sysList"></div>
  <div id="info"><h4>Бөлікті басыңыз</h4><p>Модельдегі кез келген бөлшекті шертсеңіз, сипаттамасы осында шығады.</p></div>
</aside>
<aside id="right">
  <h3>⚛ Соқтығыс (pp)</h3>
  <select id="evt">
    <option value="higgs4mu">Хиггс → ZZ* → 4 мюон</option>
    <option value="hgg">Хиггс → γγ (екі фотон)</option>
    <option value="zee">Z → e⁺e⁻</option>
    <option value="wmunu">W → μν (нейтрино)</option>
    <option value="dijet">Екі джет (QCD)</option>
    <option value="ttbar">Топ-кварк жұбы tt̄</option>
    <option value="susy">Жаңа физика (көп MET)</option>
    <option value="rand">Кездейсоқ оқиға</option>
  </select>
  <button id="fire" class="big">💥 Соқтығысты бастау</button>
  <label class="row">Жылдамдық <input id="spd" type="range" min="0.2" max="2.5" step="0.1" value="1"></label>
  <div id="legend"></div>
  <div id="evinfo"></div>
</aside>
<footer>
  <div class="grp"><label>Жару (exploded view)</label><input id="exp" type="range" min="0" max="1" step="0.005" value="0"></div>
  <button id="bExp">💥 Жару / Жинау</button>
  <button id="bCut" class="tg">Қима</button>
  <button id="bX" class="tg">Рентген</button>
  <button id="bRot" class="tg">Айналу</button>
  <button id="bV1">Алдыңғы</button><button id="bV2">Бүйір</button><button id="bV3">Изо</button>
</footer>
<div id="tip"></div>`;
const list = $('#sysList');
for (const [k, s] of Object.entries(SYSTEMS)) {
  const row = document.createElement('label'); row.className = 'sys';
  row.innerHTML = `<input type="checkbox" checked><i style="background:#${s.color.toString(16).padStart(6, '0')}"></i><span>${s.name}</span>`;
  row.querySelector('input').onchange = e => { state.hidden[k] = !e.target.checked; applyStyle(); };
  row.onmouseenter = () => showInfo(k);
  list.appendChild(row);
}
function showInfo(k, label) {
  const i = INFO[k]; if (!i) return;
  $('#info').innerHTML = `<h4>${i.title}</h4>${label ? `<div class="chip">${label}</div>` : ''}<p>${i.text}</p><ul>${i.facts.map(f => `<li>${f}</li>`).join('')}</ul>`;
}
$('#legend').innerHTML = Object.values(PARTICLES).map(p => `<div><i style="background:#${p.color.toString(16).padStart(6, '0')}"></i><b>${p.sym}</b> ${p.name}<small>${p.note}</small></div>`).join('') +
  '<div><i style="background:#ffd23a"></i>Мюон камерасындағы сигнал</div><div><i style="background:#2dff7a"></i>EM энергия · <i style="background:#ff9a1f"></i>адрон энергиясы</div>';

$('#exp').oninput = e => { state.explode = +e.target.value; applyExplode(); };
let anim = null;
$('#bExp').onclick = () => { anim = { from: state.explode, to: state.explode > .5 ? 0 : 1, t: 0 }; };
const toggle = (id, key) => { $(id).onclick = () => { state[key] = !state[key]; $(id).classList.toggle('on', state[key]); applyStyle(); }; };
$('#bCut').classList.add('on'); toggle('#bCut', 'cut'); toggle('#bX', 'xray');
let rot = false; $('#bRot').onclick = () => { rot = !rot; $('#bRot').classList.toggle('on', rot); };
const view = (x, y, z) => () => { fly = { from: camera.position.clone(), to: new THREE.Vector3(x, y, z), t: 0 }; };
let fly = null;
$('#bV1').onclick = view(0, 40, -800); $('#bV2').onclick = view(820, 40, 0); $('#bV3').onclick = view(520, 330, -760);

// collision
const sim = new EventSim(scene);
$('#spd').oninput = e => { sim.speed = +e.target.value; };
$('#fire').onclick = () => {
  const s = sim.fire($('#evt').value);
  const nm = { mu: 'μ', e: 'e', g: 'γ', h: 'h', nu: 'ν' };
  $('#evinfo').innerHTML = `<table><tr><th>Бөлшек</th><th>pT, ГэВ</th><th>η</th><th>Қайда тоқтады</th></tr>` +
    s.slice(0, 10).map(p => `<tr><td style="color:#${PARTICLES[p.kind].color.toString(16).padStart(6, '0')}">${PARTICLES[p.kind].name}${p.charge > 0 ? '⁺' : p.charge < 0 ? '⁻' : ''}</td><td>${p.pt.toFixed(1)}</td><td>${p.eta.toFixed(2)}</td><td>${({ em: 'EM калориметр', had: 'адрон калориметрі', muon: 'мюон камералары', out: p.kind === 'nu' ? 'шығып кетті' : 'шығып кетті' })[p.stop]}</td></tr>`).join('') +
    `</table><p>Жетіспейтін көлденең энергия (MET): <b>${sim.met.toFixed(0)} ГэВ</b></p>`;
  if (!state.cut) { state.cut = true; $('#bCut').classList.add('on'); applyStyle(); }
};

// picking
const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2();
let hover = null, downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
  const p = pick(e); if (p) { select(p); }
});
canvas.addEventListener('pointermove', e => { const p = pick(e); hoverSet(p, e); });
function pick(e) {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(world.children.filter(o => o.visible), false);
  for (const h of hits) {
    const m = h.object.material;
    if (m.opacity < .5) continue;
    if (m.clippingPlanes?.length) { const wp = h.point; if (wp.x > 0 && wp.y > 0) continue; }
    return h.object.userData.part;
  }
  return null;
}
function hoverSet(p, e) {
  if (hover && hover !== p) hover.obj.material.emissive.setHex(0x000000);
  hover = p;
  const tip = $('#tip');
  if (p) { p.obj.material.emissive.setHex(0x222a33); tip.style.display = 'block'; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px'; tip.textContent = p.label; canvas.style.cursor = 'pointer'; }
  else { tip.style.display = 'none'; canvas.style.cursor = 'grab'; }
}
let sel = null;
function select(p) {
  if (sel) sel.obj.material.emissiveIntensity = 1;
  sel = p; showInfo(p.sys, p.label);
}

// ------------------------------------------------------------------ loop
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05);
  if (anim) { anim.t += dt / 1.8; const k = Math.min(1, anim.t); state.explode = anim.from + (anim.to - anim.from) * (k * k * (3 - 2 * k)); $('#exp').value = state.explode; applyExplode(); if (k >= 1) anim = null; }
  if (fly) { fly.t += dt / 1.1; const k = Math.min(1, fly.t), e = k * k * (3 - 2 * k); camera.position.lerpVectors(fly.from, fly.to, e); if (k >= 1) fly = null; }
  if (rot) { const a = dt * .35, c = Math.cos(a), s = Math.sin(a), p = camera.position; const x = p.x * c - p.z * s; p.z = p.x * s + p.z * c; p.x = x; }
  controls.update(); sim.update(dt);
  renderer.render(scene, camera);
});
$('#loading').style.opacity = 0; setTimeout(() => $('#loading').remove(), 700);
window.__ready = true; window.__app = { state, sim, camera, controls, applyStyle, applyExplode };
// test / deep-link hooks:  ?explode=0.8  ?fire=higgs4mu
if (q.get('explode')) { state.explode = +q.get('explode'); $('#exp').value = state.explode; applyExplode(); }
if (q.get('fire')) { $('#evt').value = q.get('fire'); $('#fire').click(); }
if (q.get('xray')) { $('#bX').click(); }
if (q.get('ff')) for (let t = 0; t < +q.get('ff'); t += 0.05) sim.update(0.05);
if (q.get('only')) { for (const k of Object.keys(SYSTEMS)) state.hidden[k] = !q.get('only').split(',').includes(k); applyStyle(); }
