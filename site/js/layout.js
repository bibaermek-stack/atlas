// ATLAS assembly: where every real mesh from the 3MF goes.
// The 3MF is a print-plate layout (36 plates), so the assembled pose is rebuilt here
// from ATLAS geometry (1 unit = 1 mm of the 1:100 model = 0.1 m of the detector, beam = +Z).
import * as THREE from '../vendor/three.module.min.js';

export const SYSTEMS = {
  id:     { name: 'Ішкі детектор (ID / ITk)', color: 0xe8a13a },
  calo:   { name: 'Калориметрлер (LAr + Tile)', color: 0x1da1e6 },
  toroid: { name: 'Баррель тороид магниті', color: 0xc4c8cf },
  muon:   { name: 'Мюон спектрометрі (камералар)', color: 0x9a3f20 },
  sw:     { name: 'Кіші дөңгелектер (Small Wheel)', color: 0xb7bcc4 },
  ect:    { name: 'Торец тороидтары (End-cap)', color: 0xaeb3bb },
  bw:     { name: 'Үлкен дөңгелектер (Big Wheel)', color: 0x9a3f20 },
  feet:   { name: 'Тіректер (аяқтар)', color: 0x8d9299 },
};

// short hash prefix -> readable mesh
export const M = {
  itk: '4e3561e8', idCyl: '025d5cbe', red: '1278cda7', endDisc: 'aa3fd55f', endDisc2: 'f0b8c995',
  barrel: '250b6ee0', ec1: 'b826f826', ec2: '93ccf048',
  ring1: '06e4a822', ring2: 'fb2e6dbc', ring3: '39e56f3b', ring4: 'a097fad4', ring5: '73c304e5',
  ring6: '1ea57ad0', ring7: '97adea06', ring8: '88cf028a',
  rail: '2628348d', railB: '7ebe8a90', coilEnd: 'b5274f03', endFeet: '0ad1631e',
  slabL: '276183a4', slabS: '9840c3dc',
  midL: 'f541aa21', midS: '0bfdf25a', inL: '2e9a7df7', inS: '98869b28',
  ect: '9ba0a93e', ect2: 'b0d61383',
  swDisc: '49272c36', swMM1: 'fb2e6dbc',
  caloFeet: 'c37da2de',
};

const TAU = Math.PI * 2;

/** permutation matrix: longest axis -> Z, thinnest -> Y, middle -> X (flat chambers lying along the beam) */
function slabMatrix(d) {
  const o = [0, 1, 2].sort((a, b) => d[b] - d[a]);          // longest .. thinnest
  return permute(o[0], 2, o[2], 1, o[1], 0);
}
/** thinnest axis -> Z, longest -> Y, middle -> X (plates perpendicular to the beam) */
function plateMatrix(d) {
  const o = [0, 1, 2].sort((a, b) => d[b] - d[a]);
  return permute(o[2], 2, o[0], 1, o[1], 0);
}
function permute(a0, b0, a1, b1, a2, b2) {
  const m = new THREE.Matrix4().set(0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1);
  const e = m.elements;                                      // column-major
  const put = (to, from) => { e[from * 4 + to] = 1; };
  put(b0, a0); put(b1, a1); put(b2, a2);
  if (m.determinant() < 0) { e[a1 * 4 + b1] = 0; e[a1 * 4 + b1] = -1; }   // keep handedness
  return m;
}

export function buildLayout(dimsOf) {
  const parts = [];                       // {mesh, sys, label, info, mat, explode:[x,y,z], order}
  const add = (mesh, sys, label, mat, explode, extra = {}) =>
    parts.push({ mesh, sys, label, mat, explode, ...extra });
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const Rz = a => new THREE.Matrix4().makeRotationZ(a);
  const Ry = a => new THREE.Matrix4().makeRotationY(a);
  const Rx = a => new THREE.Matrix4().makeRotationX(a);
  const mul = (...ms) => ms.reduce((a, b) => a.clone().multiply(b));

  const N = 16, step = TAU / N;
  const qrot = Rz(Math.PI / 2);          // turns the built-in cut-away of the calorimeters towards the viewer

  // ---------- Inner detector ----------
  add(M.itk, 'id', 'ITk — ішкі трекер', qrot, [0, 330, 0], { tint: 0x3a2a2c, abs: true });
  add(M.idCyl, 'id', 'Ішкі детектор (ID) қабаты', qrot, [0, 280, 0], { tint: 0xf08a00, abs: true });
  add(M.red, 'id', 'Соленоид / ID сыртқы қабығы', qrot, [0, 230, 0], { tint: 0xb00010, abs: true });

  // ---------- Calorimeters ----------
  add(M.barrel, 'calo', 'Баррель калориметрі', qrot, [0, 150, 0], { tint: 0x1fa8ee, abs: true });
  for (const s of [-1, 1]) {
    add(M.ec1, 'calo', 'Торец калориметрі (EC1)', T(0, 0, s * 49), [0, 0, s * 45], { abs: true, tint: 0x1590d8 });
    add(M.ec2, 'calo', 'Торец калориметрі (EC2)', T(0, 0, s * 70.5), [0, 0, s * 80], { abs: true, tint: 0x1a82c4 });
  }
  add(M.caloFeet, 'feet', 'Калориметр тірегі', T(0, -76.65, 24), [0, -90, 0], { abs: true });
  add(M.caloFeet, 'feet', 'Калориметр тірегі', T(0, -76.65, -24), [0, -90, 0], { abs: true });

  // ---------- Barrel toroid: 7 rings + centre ring, chained end to end ----------
  const SP = 0.77;                                  // ring spacing factor (rings interlock)
  const ringZ = [[M.ring4, 0], [M.ring3, 44.5], [M.ring2, 95.75], [M.ring1, 142.6],
                 [M.ring6, -44.5], [M.ring7, -95.75], [M.ring8, -142.6]];
  for (const [id, z] of ringZ)
    add(id, 'toroid', 'Тороид сақинасы (магнит орамдары)', T(0, 0, z * SP), [0, 0, z * 0.75], { tint: 0xc4c8cf, abs: true });
  add(M.ring5, 'toroid', 'Тороидтың ортаңғы сақинасы', new THREE.Matrix4(), [0, -60, 0], { abs: true });

  // ---------- Barrel muon chambers (3 layers x 16 sectors) ----------
  const layer = (big, small, rBig, rSmall, name, mag, z0 = 0) => {
    for (let k = 0; k < N; k++) {
      const large = k % 2 === 0, id = large ? big : small, r = large ? rBig : rSmall;
      const a = k * step + step / 2;
      const m = mul(Rz(a), T(0, r, z0), slabMatrix(dimsOf(id)));
      add(id, 'muon', name, m, [-Math.sin(a) * mag, Math.cos(a) * mag, 0], { abs: true });
    }
  };
  layer(M.inL, M.inS, 56, 52, 'Мюон камерасы — ішкі қабат (BI)', 30);
  layer(M.midL, M.midS, 84, 78, 'Мюон камерасы — ортаңғы қабат (BM)', 70);
  layer(M.slabL, M.slabS, 118, 104, 'Мюон камерасы — сыртқы қабат (BO)', 115);

  // ---------- Barrel toroid rails and end feet ----------
  for (let k = 0; k < 8; k++) {
    const a = k * TAU / 8 + TAU / 16, r = 100;
    for (const z of [-62.8, 62.8])
      add(M.rail, 'toroid', 'Тороид рельсі', mul(Rz(a), T(0, r, z)), [-Math.sin(a) * 55, Math.cos(a) * 55, 0], { abs: true });
  }
  for (const s of [-1, 1])
    add(M.endFeet, 'feet', 'Тороид аяғы', mul(T(0, -118, s * 118), Ry(0)), [0, -50, s * 30], { abs: true });
  // eight floor feet under the barrel (simple blocks)
  for (let k = 0; k < 8; k++)
    add('box', 'feet', 'Едендегі тірек', T(0, -122, -112 + k * 32), [0, -60, 0], { abs: true, box: [26, 24, 18], tint: 0x9aa0a8 });

  // ---------- End-cap toroids ----------
  for (const s of [-1, 1])
    add(s > 0 ? M.ect : M.ect2, 'ect', 'Торец тороиды (End-cap)', mul(T(0, 0, s * 103), Rz(-Math.PI / 2)), [0, 0, s * 75], { abs: true });

  // ---------- Small wheels: disc + 16 chambers ----------
  for (const s of [-1, 1]) {
    add(M.swDisc, 'sw', 'Кіші дөңгелек (Small Wheel)', T(0, 0, s * 75), [0, 0, s * 120], { abs: true });
    for (let k = 0; k < N; k++) {
      const a = k * step + step / 2, id = k % 2 ? 'a1bfa020' : '5d5de22c';
      add(id, 'sw', 'Small Wheel камерасы', mul(Rz(a), T(0, 30, s * 79), plateMatrix(dimsOf(id))), [-Math.sin(a) * 15, Math.cos(a) * 15, s * 135], { abs: true });
    }
  }
  // ---------- Big wheels: one ring of 16 sector chambers on two wheels per side ----------
  for (const s of [-1, 1]) for (const z of [142, 160]) {
    for (let k = 0; k < N; k++) {
      const a = k * step + step / 2, big = k % 2 === 0, id = big ? '894a4179' : 'f7b50870', r = 82;
      const sc = new THREE.Matrix4().makeScale(r / 62 * (big ? 1 : 1.5), 1.9, 1);
      add(id, 'bw', 'Үлкен дөңгелек камерасы', mul(Rz(a), T(0, r, s * z), plateMatrix(dimsOf(id)), sc), [-Math.sin(a) * 30, Math.cos(a) * 30, s * (z > 150 ? 105 : 70)], { abs: true });
    }
  }
  return parts;
}
