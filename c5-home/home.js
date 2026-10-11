// Roof Command home: the homeowner record with the Roof X-Ray house as the hero.
// House and plating from c3-roof-xray, measurements logic from c4-command-deck (dk.js):
// plane area = plan area x pitch factor, squares = area / 100, edge length = 3D distance.
// Everything shown is computed from the home's real building outline (lib/real-roof.js) with LiDAR pitch where measured.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
// Real roofs: the app's roof solver, the spec converter and every Daily 50 stop's real building outline.
// (Classic scripts that set window.RoofPlan / RealRoof / ROOFS; importing them runs them once.)
await Promise.all([import('../../js/roofplan.js'), import('../lib/real-roof.js'), import('../c4-command-deck/data/roofs-dfw.js')]).catch(() => {});
if (window.HOME_READY) await window.HOME_READY; // rec.js: the county record (address, permit, pitch) for this home

// ---------- icons (shared set with the Command Deck) ----------
const I = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3.2l1.6 4-2 1.3a11 11 0 0 0 6.9 6.9l1.3-2 4 1.6V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  hail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="3"/><circle cx="16.5" cy="9" r="4"/><circle cx="16" cy="18.5" r="1.6"/></svg>',
  roof: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 12 12 4.5 21 12M6 10v9.5h12V10"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M10 12h5M10 15.5h5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19.5h14M14.5 5.5l3 3L9 17H6v-3z"/></svg>',
  ruler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 16 16 3.5l4.5 4.5L8 20.5z"/><path d="M7 12.5l2 2M10 9.5l2 2M13 6.5l2 2"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 4 8 4.5-8 4.5-8-4.5zM4 13l8 4.5 8-4.5M4 17l8 4.5 8-4.5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'
};
document.querySelectorAll('[data-i]').forEach(n => { n.innerHTML = I[n.dataset.i] || ''; });

// ---------- geometry (scene units; SCALE feet per unit) ----------
const SCALE = 2.8;
const E = 3.0, EG = 2.8, RISE = 2.5; // main eave height, garage eave height, main ridge rise (6/12 over a 5 unit run)
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// Edge types per plane follow the point order: edge i runs pts[i] -> pts[i+1].
// Texas data (lib/brand.js dataRoot) with no LiDAR pitch: the headline says "not measured", never a bare 6/12
const pitchGap = () => !!(window.activeRoofer && activeRoofer().dataRoot && SPEC && !SPEC.none && !SPEC.pitchMeasured);
let H0, SPEC, HAIL, PLANES, CAPS, FP = null, SPEC_INFO = null, M;
const defaultPlanes = () => [
  { id: 'A', name: 'Front slope', rise: 6, hit: 'heavy', pts: [V(-9.5, E, 5.5), V(9.5, E, 5.5), V(4, E + RISE, 0), V(-4, E + RISE, 0)], types: ['eave', 'hip', 'ridge', 'hip'] },
  { id: 'B', name: 'Rear slope', rise: 6, pts: [V(9.5, E, -5.5), V(-9.5, E, -5.5), V(-4, E + RISE, 0), V(4, E + RISE, 0)], types: ['eave', 'hip', 'ridge', 'hip'] },
  { id: 'C', name: 'West hip', rise: 6, pts: [V(-9.5, E, -5.5), V(-9.5, E, 5.5), V(-4, E + RISE, 0)], types: ['eave', 'hip', 'hip'] },
  { id: 'D', name: 'East hip', rise: 6, pts: [V(9.5, E, 5.5), V(9.5, E, -5.5), V(4, E + RISE, 0)], types: ['eave', 'hip', 'hip'] },
  { id: 'E', name: 'Garage west', rise: 6, hit: 'light', pts: [V(3.1, EG, 12.4), V(3.1, EG, 5.9), V(7, EG + 1.95, 3.95), V(7, EG + 1.95, 12.4)], types: ['eave', 'valley', 'ridge', 'rake'] },
  { id: 'F', name: 'Garage east', rise: 6, pts: [V(10.9, EG, 5.9), V(10.9, EG, 12.4), V(7, EG + 1.95, 12.4), V(7, EG + 1.95, 3.95)], types: ['eave', 'rake', 'ridge', 'valley'] },
  { id: 'G', name: 'Porch', rise: 4, pts: [V(-7.5, 2.05, 8.75), V(-0.7, 2.05, 8.75), V(-0.7, 2.95, 6.05), V(-7.5, 2.95, 6.05)], types: ['eave', 'rake', 'wall', 'rake'] },
];
const defaultCaps = () => [
  [V(-4, E + RISE, 0), V(4, E + RISE, 0)],
  [V(-4, E + RISE, 0), V(-9.5, E, 5.5)], [V(-4, E + RISE, 0), V(-9.5, E, -5.5)],
  [V(4, E + RISE, 0), V(9.5, E, 5.5)], [V(4, E + RISE, 0), V(9.5, E, -5.5)],
  [V(7, EG + 1.95, 3.95), V(7, EG + 1.95, 12.4)],
];
const EDGE_LABEL = { ridge: 'Ridge', hip: 'Hip', valley: 'Valley', eave: 'Eave', rake: 'Rake', wall: 'Wall line' };
const EDGE_ORDER = ['ridge', 'hip', 'valley', 'eave', 'rake', 'wall'];
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const EDGE_COL = {}; EDGE_ORDER.forEach(t => EDGE_COL[t] = css('--e-' + t));
const HAIL_MAX = (window.RC && RC.facts.storm.max) || 1.41;
// The roof is the home's REAL roof: its building outline through the roof solver (lib/real-roof.js spec: feet,
// x east, y south, z above the eave). A Daily 50 stop is rebuilt from data/roofs-dfw.js every time (never a stale
// saved drawing); no id = the default real house; no outline on file = an honest empty state, no squares.
let NONE = false, DEFAULT_HOUSE = false;
function realSpecFor(h) {
  const RR = window.RealRoof, ROOFS = window.ROOFS || {};
  if (!RR) return h.spec || null;
  const dm = /^d([a-z]+)-(\d+)$/.exec(h.rawId || '');
  const dk = dm ? dm[1] : null;   // the roofer's own roofs (same as the Daily 50)
  if (dm && ROOFS[dk]) return RR.spec(ROOFS[dk]['stop' + dm[2]], { seed: +dm[2] });
  const mm = /^m(\d+)$/.exec(h.rawId || '');
  if (mm && RR.mapCached) { const e = RR.mapCached(mm[1]); return e ? RR.spec(e, { seed: +mm[1] % 9973 }) : RR.none(); } // storm map home: its own footprint
  if (!h.rawId) { const R0 = ROOFS[window.rooferKey ? rooferKey() : 'jackson']; if (R0 && R0[R0.default]) { DEFAULT_HOUSE = true; return RR.spec(R0[R0.default], { seed: 1 }); } }
  return RR.none(); // never a drawn stand-in: no outline, no roof
}
// storm map homes need their footprint tile fetched before the (synchronous) roof build
function preloadMap(h) {
  const mm = /^m(\d+)$/.exec((h && h.rawId) || ''); if (!mm || !window.RealRoof || !RealRoof.mapEntry) return Promise.resolve();
  const r = h.rec || {}; return RealRoof.mapEntry(mm[1], r.lon, r.lat);
}
await preloadMap(window.HOME);
function computeRoof() {
H0 = window.HOME || {}; DEFAULT_HOUSE = false; SPEC = realSpecFor(H0); NONE = !!(SPEC && SPEC.none);
HAIL = { size: H0.hail != null ? H0.hail.toFixed(2) + ' in' : 'No hail on file', date: H0.hailDate || ((window.RC && RC.facts.storm.d) || '') };
PLANES = defaultPlanes(); CAPS = defaultCaps(); FP = null; SPEC_INFO = null;
if (NONE) { PLANES = []; CAPS = []; }
else if (SPEC) {
  // square the house to its base: turn it by the small angle (under 45 deg) that lines its minimum-area bounding
  // rectangle up with the scene axes, then centre that rectangle on the plinth. Lengths and areas are unchanged.
  const rot = squareAngle(SPEC.fp), rc = Math.cos(-rot), rs = Math.sin(-rot);
  const RT = p => [p[0] * rc - p[1] * rs, p[0] * rs + p[1] * rc];
  const rfp = SPEC.fp.map(RT), xs = rfp.map(p => p[0]), ys = rfp.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const T = p => { const q = RT(p); return V((q[0] - cx) / SCALE + .7, E + (p[2] || 0) / SCALE, (q[1] - cy) / SCALE + 3.4); };
  const kk = p => (+p[0]).toFixed(2) + ',' + (+p[1]).toFixed(2) + ',' + (+(p[2] || 0)).toFixed(2);
  const typed = {}; SPEC.edges.forEach(e => { typed[[kk(e.a), kk(e.b)].sort().join('|')] = e.type; });
  const hits = SPEC.hit || [];
  PLANES = SPEC.planes.map(pl => ({
    id: pl.id, name: pl.name, rise: pl.rise, hit: hits[0] === pl.id ? 'heavy' : hits.includes(pl.id) ? 'light' : undefined,
    pts: pl.pts.map(T),
    types: pl.types ? pl.types.slice() : pl.pts.map((a, i) => { const b = pl.pts[(i + 1) % pl.pts.length]; const t = typed[[kk(a), kk(b)].sort().join('|')]; if (t) return t; const za = a[2] || 0, zb = b[2] || 0; return za === 0 && zb === 0 ? 'eave' : Math.abs(za - zb) < .01 ? 'ridge' : 'hip'; })
  }));
  CAPS = SPEC.edges.filter(e => e.type === 'ridge' || e.type === 'hip').map(e => [T(e.a), T(e.b)]);
  FP = SPEC.fp.map(p => T([p[0], p[1], 0]));
  SPEC_INFO = { style: SPEC.mainStyle === 'gable' ? 'gable roof' : 'hip roof', real: !!SPEC.real };
}

// ---------- measurements (all computed) ----------
M = { planes: [], edgeTotals: {}, area: 0, squares: 0 };
const seen = new Set();
PLANES.forEach(P => {
  const plan = Math.round(planArea(P.pts) * SCALE * SCALE);
  const area = Math.round(plan * factor(P.rise));
  const edges = P.types.map((t, i) => { const a = P.pts[i], b = P.pts[(i + 1) % P.pts.length]; return { type: t, a, b, ft: Math.round(a.distanceTo(b) * SCALE) }; });
  edges.forEach(e => { // shared edges (ridge, hips, valleys) count once in the roof totals
    const k = [e.a, e.b].map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).sort().join('|');
    if (seen.has(k)) return; seen.add(k); M.edgeTotals[e.type] = (M.edgeTotals[e.type] || 0) + e.ft;
  });
  P.m = { plan, area, squares: Math.round(area / 10) / 10, factor: factor(P.rise), edges };
  M.planes.push(P.m); M.area += area;
});
M.squares = Math.round(M.planes.reduce((s, p) => s + p.squares * 10, 0)) / 10;
if (SPEC && SPEC.real && SPEC.squares != null) M.squares = SPEC.squares; // real plan area x pitch factor / 100, same number the deck shows
if (NONE) { M.pitch = ''; M.waste = 0; M.edgeTotals = {}; if (window.HOME) { window.HOME.measure = null; if (window.renderRecord) window.renderRecord(); } return; }
{ const by = {}; PLANES.forEach(P => by[P.rise] = (by[P.rise] || 0) + P.m.area); M.pitch = Object.entries(by).sort((a, b) => b[1] - a[1])[0][0] + '/12'; }
{ const ty = PLANES.flatMap(P => P.types); const cx = ty.filter(t => t === 'hip').length / 2 + ty.filter(t => t === 'valley').length; M.waste = cx === 0 ? 10 : cx <= 4 ? 12 : cx <= 8 ? 15 : 18; }
if (window.HOME) { window.HOME.measure = { squares: M.squares, waste: M.waste, pitch: M.pitch }; if (window.renderRecord) window.renderRecord(); }
}
// angle of the footprint's minimum-area bounding rectangle, folded into [-45, 45] deg (convex hull, one try per hull edge)
function squareAngle(pts) {
  const P = pts.map(p => [+p[0], +p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return 0;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  P.forEach(p => { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
  P.slice().reverse().forEach(p => { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); });
  const H = lo.slice(0, -1).concat(hi.slice(0, -1));
  let best = 0, bestA = Infinity;
  H.forEach((a, i) => {
    const b = H[(i + 1) % H.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < .5) return;
    const t = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(t), s = Math.sin(t);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    H.forEach(p => { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
    const A = (u1 - u0) * (v1 - v0); if (A < bestA - 1e-6) { bestA = A; best = t; }
  });
  const q = Math.PI / 2; return best - Math.round(best / q) * q;
}
function factor(rise) { return Math.sqrt(1 + (rise / 12) ** 2); }
function planArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.z - q.x * p.z; } return Math.abs(a) / 2; }

// ---------- renderer, scene, lights (the c3 light studio) ----------
const canvas = document.getElementById('gl'), stage = document.getElementById('stage');
const isPhone = matchMedia('(max-width:640px)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.7;
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 300);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.07; controls.minDistance = 14; controls.maxDistance = 90; controls.maxPolarAngle = 1.38; controls.enablePan = false;
const key = new THREE.DirectionalLight('#FFF6EC', 3.3); key.position.set(26, 28, 14); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 5, far: 90 });
key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02; key.shadow.radius = 9; key.shadow.blurSamples = 18; scene.add(key);
const fill = new THREE.DirectionalLight('#DDE6FF', 0.3); fill.position.set(-24, 10, 26); scene.add(fill);
const rim = new THREE.DirectionalLight('#FFFFFF', 1.4); rim.position.set(-10, 18, -30); scene.add(rim);
scene.add(new THREE.HemisphereLight('#FFFFFF', '#7F8A9F', 0.42));

// ---------- plinth, walls ----------
const MARGIN = 1.9; // plinth margin round the footprint, units (~5.3 ft), the same on every side
let FPB = null, PW = 25, PD = 21, world = null, house = null, roof = null, contactMat = null;
let HOME0 = null;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShadowMaterial({ opacity: .3 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
{
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(11,16,32,.85)'); gr.addColorStop(.45, 'rgba(11,16,32,.38)'); gr.addColorStop(1, 'rgba(11,16,32,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  contactMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }); // offset: no z-fight with the floor when a big house pulls the camera back
}
function roundedRectShape(w, d, r) { const s = new THREE.Shape(), x = -w / 2, y = -d / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
const plinthMat = new THREE.MeshPhysicalMaterial({ color: '#DCE0E8', roughness: .6, metalness: .08, clearcoat: .25, clearcoatRoughness: .5 });
const BASE = .44;
const wallMat = new THREE.MeshPhysicalMaterial({ color: '#E3E7EE', roughness: .5, metalness: .06, clearcoat: .25, clearcoatRoughness: .5 });
const trimMat = new THREE.MeshPhysicalMaterial({ color: '#AEB6C6', roughness: .32, metalness: .6 });
// glass: blue-grey with a soft sky sheen baked into a small gradient (reads as a window from any angle, never a black hole)
const glassTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  const v = g.createLinearGradient(0, 0, 0, 128); v.addColorStop(0, '#B4C4D6'); v.addColorStop(.55, '#6F8299'); v.addColorStop(1, '#4C5D74');
  g.fillStyle = v; g.fillRect(0, 0, 64, 128);
  const d = g.createLinearGradient(0, 0, 64, 128); d.addColorStop(.28, 'rgba(255,255,255,0)'); d.addColorStop(.4, 'rgba(255,255,255,.34)'); d.addColorStop(.5, 'rgba(255,255,255,0)');
  g.fillStyle = d; g.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const glassMat = new THREE.MeshPhysicalMaterial({ map: glassTex, roughness: .12, metalness: .15, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
const winTrimMat = new THREE.MeshPhysicalMaterial({ color: '#F6F7FA', roughness: .45, metalness: .04, clearcoat: .3, clearcoatRoughness: .5 });
const doorMat = new THREE.MeshPhysicalMaterial({ color: '#2A3350', roughness: .4, metalness: .3 });
const gdoorMat = new THREE.MeshPhysicalMaterial({ color: '#D3D8E2', roughness: .45, metalness: .1 });
function box(w, h, d, x, y, z, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; house.add(m); return m; }
function buildHouse() { if (NONE) return; if (FP) buildSpecHouse(); else {
box(18, 3, 10, 0, 1.5, 0, wallMat); box(7, 2.8, 7.4, 7, 1.4, 8.3, wallMat);
box(18.3, .14, 10.3, 0, .07, 0, trimMat); box(7.3, .14, 7.6, 7, .07, 8.3, trimMat);
{ const s = new THREE.Shape(); s.moveTo(-3.5, 0); s.lineTo(3.5, 0); s.lineTo(0, 1.75); s.lineTo(-3.5, 0); const g = new THREE.ExtrudeGeometry(s, { depth: .2, bevelEnabled: false }); const m = new THREE.Mesh(g, wallMat); m.position.set(7, 2.8, 11.8); m.castShadow = true; house.add(m); const g2 = m.clone(); g2.position.z = 4.6; house.add(g2); }
function windowAt(x, y, z, w, h, axis) { const t = .12; if (axis === 'z') { box(w + .24, h + .24, t, x, y, z + t / 2, trimMat); box(w, h, t, x, y, z + t, glassMat); box(.06, h, t * 1.4, x, y, z + t, trimMat); } else { box(t, h + .24, w + .24, x + t / 2 * Math.sign(x), y, z, trimMat); box(t, h, w, x + t * Math.sign(x), y, z, glassMat); } }
windowAt(-7.6, 1.7, 5, 1.6, 1.3, 'z'); windowAt(-1.6, 1.7, 5, 1.6, 1.3, 'z'); windowAt(1.8, 1.7, 5, 1.2, 1.3, 'z');
windowAt(-9, 1.7, -2, 2.2, 1.3, 'x'); windowAt(-9, 1.7, 2.2, 1.6, 1.3, 'x'); windowAt(10.5, 1.6, 6.4, 1.4, 1.1, 'x');
box(1.1, 2.2, .14, -4.6, 1.1, 5.07, doorMat); box(1.38, 2.42, .08, -4.6, 1.21, 5.02, trimMat);
box(5.2, 2.2, .1, 7, 1.1, 12.03, gdoorMat); for (let i = 1; i < 5; i++) box(5.2, .035, .04, 7, i * .44, 12.1, trimMat);
box(6.6, .16, 3.4, -4.1, .08, 6.8, trimMat); for (const px of [-7.2, -4.1, -1.0]) box(.18, 1.95, .18, px, 1.0, 8.25, trimMat);
} }
// walls from the drawn footprint, gable ends under every rake, windows along each wall, door and garage door on the street side
function buildSpecHouse() {
  const shp = new THREE.Shape(FP.map(p => new THREE.Vector2(p.x, -p.z)));
  const wg = new THREE.ExtrudeGeometry(shp, { depth: E, bevelEnabled: false }); wg.rotateX(-Math.PI / 2);
  const w = new THREE.Mesh(wg, wallMat); w.castShadow = true; w.receiveShadow = true; house.add(w);
  const tg = new THREE.ExtrudeGeometry(shp, { depth: .14, bevelEnabled: true, bevelSize: .15, bevelThickness: 0, bevelSegments: 1 }); tg.rotateX(-Math.PI / 2);
  const t = new THREE.Mesh(tg, trimMat); t.receiveShadow = true; house.add(t);
  const gm = wallMat.clone(); gm.side = THREE.DoubleSide;
  PLANES.forEach(P => P.types.forEach((ty, i) => {
    if (ty !== 'rake') return; let a = P.pts[i], b = P.pts[(i + 1) % P.pts.length]; if (a.y > b.y) [a, b] = [b, a];
    const g = new THREE.BufferGeometry().setFromPoints([a, b, V(b.x, E, b.z)]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, gm); m.castShadow = true; m.position.y = -.02; house.add(m);
  }));
  // windows and the front door, by rule: sill and head from the wall height (head kept clear of the eave), even spacing
  // along each wall with end margins, walls too short skipped; each one set on its wall plane facing out (any angle)
  const inside = (x, z) => pointInPoly({ x, y: z }, FP.map(p => ({ x: p.x, y: p.z })));
  const SILL = E * .34, HEAD = E * .78, WW = 1.3, FR = .09, END = 1.1, GAP = 3.1;  // units (2.8 ft): sill ~2.9 ft, head ~6.6 ft, eave clear ~1.6 ft
  const walls = FP.map((a, i) => {
    const b = FP[(i + 1) % FP.length], L = a.distanceTo(b), along = b.clone().sub(a).normalize();
    let n = V(along.z, 0, -along.x); const mid = a.clone().add(b).multiplyScalar(.5);
    if (inside(mid.x + n.x * .3, mid.z + n.z * .3)) n.negate();
    const usable = L - 2 * END, cnt = usable < WW + 2 * FR ? 0 : Math.max(1, Math.floor((usable + GAP) / (WW + GAP)));
    return { a, along, n, L, usable, cnt };
  });
  // the door: middle of the longest wall that faces the street side of the view (+z)
  const front = walls.filter(w => w.n.z > .7 && w.L >= 4).sort((p, q) => q.L - p.L)[0];
  if (front) { let c = front.cnt; if (c % 2 === 0) c = front.usable / (c + 1) >= WW + 1.6 ? c + 1 : Math.max(1, c - 1); front.cnt = c; front.door = (c - 1) / 2; }
  walls.forEach(w => {
    for (let k = 0; k < w.cnt; k++) {
      const p = w.a.clone().addScaledVector(w.along, END + w.usable * (k + .5) / w.cnt);
      const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(w.n.x, w.n.z); house.add(g);
      if (w.door === k) doorAt(g); else windowAt(g);
    }
  });
  function part(g, w, h, d, x, y, z, mat, shadow) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = !!shadow; m.receiveShadow = true; g.add(m); return m; }
  function windowAt(g) {
    const hh = HEAD - SILL, cy = (SILL + HEAD) / 2;
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(WW, hh), glassMat); gl.position.set(0, cy, .02); gl.receiveShadow = true; g.add(gl);
    part(g, WW + 2 * FR, FR, .08, 0, HEAD + FR / 2, .04, winTrimMat, true);           // head
    part(g, WW + 2 * FR, FR, .08, 0, SILL - FR / 2, .04, winTrimMat);                 // bottom rail
    part(g, FR, hh, .08, -(WW + FR) / 2, cy, .04, winTrimMat, true); part(g, FR, hh, .08, (WW + FR) / 2, cy, .04, winTrimMat, true);
    part(g, WW + .34, .07, .17, 0, SILL - FR - .035, .085, winTrimMat, true);          // sill
    part(g, .035, hh, .025, 0, cy, .035, winTrimMat); part(g, WW, .035, .025, 0, cy, .035, winTrimMat); // muntins
  }
  function doorAt(g) {
    const dw = 1.2, top = HEAD + .05, y0 = .14, h = top - y0;
    part(g, dw, h, .05, 0, y0 + h / 2, .025, doorMat);
    part(g, dw + 2 * FR, FR, .1, 0, top + FR / 2, .05, winTrimMat, true);
    part(g, FR, h, .1, -(dw + FR) / 2, y0 + h / 2, .05, winTrimMat, true); part(g, FR, h, .1, (dw + FR) / 2, y0 + h / 2, .05, winTrimMat, true);
    const lite = new THREE.Mesh(new THREE.PlaneGeometry(dw * .62, h * .3), glassMat); lite.position.set(0, y0 + h * .76, .055); g.add(lite);
    part(g, .07, .07, .08, dw * .36, y0 + h * .46, .08, trimMat);                       // knob
    part(g, dw + .9, .12, .6, 0, .06, .3, plinthMat, true);                            // step
  }
}

// ---------- roof planes (plated, c3) ----------
const RED = new THREE.Color('#A3161F'), RED_HIT = new THREE.Color('#BE2A30');
const TRIM_BASE = new THREE.Color('#C9D0DD'), TRIM_ACTIVE = new THREE.Color('#0B1020');
const SLAB_BASE = new THREE.Color('#1A2650'), SLAB_RED = new THREE.Color('#4A1412');
function pointInPoly(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (((a.y > p.y) !== (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) c = !c; } return c; }
function rand(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function bar(a, b, up, w, h, mat, lift) {
  const d = b.clone().sub(a); const len = d.length(); d.normalize();
  const side = new THREE.Vector3().crossVectors(d, up).normalize(); const upn = new THREE.Vector3().crossVectors(side, d).normalize();
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), mat);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, upn, side));
  m.position.copy(a).add(b).multiplyScalar(.5).addScaledVector(upn, lift);
  m.castShadow = true; m.receiveShadow = true; return m;
}
const plateGeo = new THREE.BoxGeometry(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
let planeGroups = [], caps = null, dimsG = null, DIMS = [], pickables = [];
const capMat = new THREE.MeshPhysicalMaterial({ color: '#D9DEE8', roughness: .3, metalness: .7, clearcoat: .5, transparent: true, opacity: 1 });
const dimMat = new THREE.MeshBasicMaterial({ color: '#0B1020', toneMapped: false });
const labelsEl = document.getElementById('labels');
const mk = (cls, html) => { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; labelsEl.appendChild(el); return el; };
const edgeMats = {}; EDGE_ORDER.forEach(t => edgeMats[t] = new THREE.MeshBasicMaterial({ color: EDGE_COL[t], toneMapped: false }));

function buildRoof() {
PLANES.forEach((P, idx) => {
  const p0 = P.pts[0], p1 = P.pts[1];
  const u = p1.clone().sub(p0).normalize(); const other = P.pts[2].clone().sub(p0);
  const n = new THREE.Vector3().crossVectors(u, other).normalize(); if (n.y < 0) n.negate();
  const v = new THREE.Vector3().crossVectors(n, u).normalize(); if (v.dot(other) < 0) v.negate();
  const to2 = q => { const d = q.clone().sub(p0); return new THREE.Vector2(d.dot(u), d.dot(v)); };
  const poly = P.pts.map(to2);
  const centroid = P.pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / P.pts.length);
  const g = new THREE.Group(); roof.add(g);
  const basis = new THREE.Matrix4().makeBasis(u, n, v.clone());
  const shape = new THREE.Shape(poly.map(q => new THREE.Vector2(q.x, q.y)));
  const sg = new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: false });
  const m = new THREE.Matrix4().makeBasis(u, v, n.clone().negate()); m.setPosition(p0); sg.applyMatrix4(m);
  const slab = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: '#1A2650', roughness: .7, metalness: .3 }));
  slab.castShadow = true; slab.receiveShadow = true; slab.userData.plane = idx; g.add(slab);

  const minX = Math.min(...poly.map(q => q.x)), maxX = Math.max(...poly.map(q => q.x)), maxY = Math.max(...poly.map(q => q.y));
  const W = .4, H = .26, gap = .035; const R = rand(7919 * (idx + 3));
  const mats = [], cols = [];
  for (let r = 0, y = H / 2 + .03; y < maxY; r++, y += H) { const off = (r % 2) * W * .5; for (let x = minX - W + off; x < maxX + W; x += W) { const cx = x + W / 2; if (!pointInPoly({ x: cx, y }, poly)) continue; mats.push({ cx, cy: y, jitter: (R() - .5) }); cols.push(R()); } }
  const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: .34, metalness: .74, clearcoat: .3, clearcoatRoughness: .4, emissive: '#000000' });
  const inst = new THREE.InstancedMesh(plateGeo, mat, mats.length); inst.castShadow = true; inst.receiveShadow = true;
  const MM = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(); const qBasis = new THREE.Quaternion().setFromRotationMatrix(basis);
  const baseCols = [], dents = []; const RH = rand(4242 + idx);
  const hailP = P.hit === 'heavy' ? .085 : P.hit === 'light' ? .03 : 0;
  mats.forEach((pl, i) => {
    const hit = RH() < hailP;
    const tilt = .055 + pl.jitter * .02 + (hit ? (RH() - .5) * .22 : 0); const twist = hit ? (RH() - .5) * .18 : pl.jitter * .012;
    Q.copy(qBasis).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, twist, 0)));
    const pos = p0.clone().addScaledVector(u, pl.cx).addScaledVector(v, pl.cy).addScaledVector(n, .07);
    S.set(W - gap, .04, H + .05); MM.compose(pos, Q, S); inst.setMatrixAt(i, MM);
    const t = cols[i]; const c = new THREE.Color().setHSL(.627 + t * .01, .70 + t * .06, .30 + t * .08);
    baseCols.push({ c, hit }); inst.setColorAt(i, c);
    if (hit) dents.push({ pos: pos.clone().addScaledVector(n, .08), r: .07 + RH() * .08 });
  });
  inst.instanceColor.needsUpdate = true; inst.userData.plane = idx; g.add(inst);

  let marks = null;
  if (dents.length) {
    const mm = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    marks = new THREE.InstancedMesh(new THREE.RingGeometry(.55, 1, 28), mm, dents.length);
    const qn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    dents.forEach((d, i) => { MM.compose(d.pos, qn, new THREE.Vector3(d.r, d.r, d.r)); marks.setMatrixAt(i, MM); });
    marks.renderOrder = 3; g.add(marks);
  }
  const trim = new THREE.MeshPhysicalMaterial({ color: TRIM_BASE.clone(), roughness: .3, metalness: .75, clearcoat: .4 });
  for (let i = 0; i < P.pts.length; i++) g.add(bar(P.pts[i], P.pts[(i + 1) % P.pts.length], n, .3, .09, trim, .11));

  // typed edge bars (edges mode), flat colour so the legend matches exactly
  const edgeG = new THREE.Group(); edgeG.visible = false; g.add(edgeG);
  P.m.edges.forEach(e => { const b = bar(e.a, e.b, n, .3, .12, edgeMats[e.type], .36); b.castShadow = false; b.receiveShadow = false; edgeG.add(b); });

  // ghost outline at the assembled position, shown only while this plane is lifted
  const ghostMat = new THREE.LineDashedMaterial({ color: '#737B8F', dashSize: .35, gapSize: .25, transparent: true, opacity: 0 });
  const gl = new THREE.Line(new THREE.BufferGeometry().setFromPoints([...P.pts, P.pts[0]]), ghostMat); gl.computeLineDistances(); roof.add(gl);

  const explodeDir = n.clone().multiplyScalar(1.15).add(new THREE.Vector3(0, .75, 0));
  planeGroups.push({ P, g, inst, mat, marks, trim, n, u, v, centroid, explodeDir, baseCols, slab, edgeG, ghostMat, hits: dents.length, hover: 0, act: 0, lift: 0 });
});
caps = new THREE.Group(); roof.add(caps); CAPS.forEach(([a, b]) => caps.add(bar(a, b, UP, .62, .2, capMat, .2)));

// ---------- dimension lines along eaves (dims mode) ----------
dimsG = new THREE.Group(); dimsG.visible = false; roof.add(dimsG);
const CENTER = new THREE.Vector3(.7, 0, 3.4);
DIMS = [];
PLANES.forEach(P => P.m.edges.forEach(e => { if (e.type === 'eave') DIMS.push({ a: e.a, b: e.b, ft: e.ft }); }));
DIMS.forEach(d => {
  const dir = d.b.clone().sub(d.a); dir.y = 0; const L = dir.length(); dir.normalize();
  let nrm = new THREE.Vector3(-dir.z, 0, dir.x); const mid = d.a.clone().add(d.b).multiplyScalar(.5);
  if (nrm.dot(mid.clone().sub(CENTER).setY(0)) < 0) nrm.negate();
  const off = 1.7, a2 = d.a.clone().addScaledVector(nrm, off), b2 = d.b.clone().addScaledVector(nrm, off);
  const bw = .07;
  dimsG.add(bar(a2, b2, UP, bw, bw, dimMat, 0));
  dimsG.add(bar(d.a.clone().addScaledVector(nrm, .45), d.a.clone().addScaledVector(nrm, off + .35), UP, bw, bw, dimMat, 0));
  dimsG.add(bar(d.b.clone().addScaledVector(nrm, .45), d.b.clone().addScaledVector(nrm, off + .35), UP, bw, bw, dimMat, 0));
  d.mid = mid; d.nrm = nrm; d.off = off + .9; d.len = L;
});

// ---------- labels ----------
labelsEl.innerHTML = '';
planeGroups.forEach((pg, i) => {
  pg.pin = mk('pin' + (pg.P.hit ? ' hit' : ''), `<i>${pg.P.id}</i>${pg.P.m.squares.toFixed(1)} sq <small>${pg.P.rise}/12</small>`);
  pg.pin.onclick = () => focusPlane(i);
  pg.epins = pg.P.m.edges.map(e => mk('epin', `<i style="background:${EDGE_COL[e.type]}"></i><b>${e.ft} ft</b><span>${EDGE_LABEL[e.type]}</span>`));
  if (pg.P.hit) pg.hpin = mk('hpin' + (pg.P.hit === 'light' ? ' low' : ''), `<div class="k"><i>${pg.P.id}</i>${pg.P.name}</div><div class="big"><em>${HAIL.size}</em> hail, ${HAIL.date}</div><div class="s">${pg.hits} marks, ${pg.P.hit === 'heavy' ? 'faced the storm' : 'glancing side'}</div>`);
});
DIMS.forEach(d => { d.pin = mk('dpin', `${d.ft} ft`); });
}
const legend = document.getElementById('legend');

// ---------- state ----------
let activeIdx = -1, hoverIdx = -1, mode = 'planes', explodeT = 0, explodeTarget = 0, tween = null, frames = 0, last = 0;
let HOME = null;
const chips = document.getElementById('chips'), bWhole = document.getElementById('bWhole'), bExplode = document.getElementById('bExplode');
const focusEl = document.getElementById('focus'), tableEl = document.getElementById('table'), measPill = document.getElementById('measPill'), measTitle = document.getElementById('measTitle');
const sheet = document.getElementById('sheet'), sheetBody = document.getElementById('sheetBody'), sheetTitle = document.getElementById('sheetTitle');

// ---------- build (and rebuild in place when the home changes; renderer, lights and loop are kept) ----------
function build() {
  computeRoof();
  if (world) { scene.remove(world); world.traverse(o => { if (o.geometry && o.geometry !== plateGeo) o.geometry.dispose(); }); }
  world = new THREE.Group(); scene.add(world);
  FPB = FP ? { x0: Math.min(...FP.map(p => p.x)), x1: Math.max(...FP.map(p => p.x)), z0: Math.min(...FP.map(p => p.z)), z1: Math.max(...FP.map(p => p.z)) } : null;
  PW = FPB ? FPB.x1 - FPB.x0 + 2 * MARGIN : 25; PD = FPB ? FPB.z1 - FPB.z0 + 2 * MARGIN : 21;
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(44 * PW / 25, 38 * PD / 21), contactMat);
  contact.rotation.x = -Math.PI / 2; contact.position.set(.7, .004, 3.4); world.add(contact);
  const plinthGeo = new THREE.ExtrudeGeometry(roundedRectShape(PW, PD, 1.0), { depth: .26, bevelEnabled: true, bevelSize: .12, bevelThickness: .12, bevelSegments: 3 }); plinthGeo.rotateX(-Math.PI / 2);
  const plinth = new THREE.Mesh(plinthGeo, plinthMat); plinth.position.set(.7, 0, 3.4); plinth.receiveShadow = true; plinth.castShadow = true; world.add(plinth);
  house = new THREE.Group(); house.position.y = BASE; world.add(house); buildHouse();
  roof = new THREE.Group(); roof.position.y = BASE; world.add(roof); planeGroups = []; buildRoof();
  pickables = planeGroups.flatMap(pg => [pg.slab, pg.inst]);
  HOME = isPhone ? { pos: V(33, 23, 41), target: V(1.0, 1.8, 3.4) } : { pos: V(26.5, 18.5, 32), target: V(1.0, 2.0, 3.4) };
  if (FPB) { HOME.pos.x -= .3; HOME.target.x = .7; } // real homes: turn about the house centre (= plinth centre)
  if (FPB) {
    // fit the whole house: scale the view by the plinth size, and grow the key light's shadow box to cover it
    const k = Math.min(2.3, Math.max(.85, Math.max(PW / 25, PD / 21) * 1.04)); HOME.pos.sub(HOME.target).multiplyScalar(k).add(HOME.target);
    const ext = Math.max(24, Math.max(PW, PD) * .75 + 6); Object.assign(key.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, far: 90 + ext }); key.shadow.camera.updateProjectionMatrix();
    HOME0 = { pos: HOME.pos.clone(), target: HOME.target.clone() };   // the unfitted view: __refit starts from here when the stage changes size
    if (stage.clientWidth && stage.clientHeight) fitHome();   // a stage with no size yet (hidden column) cannot be fitted; __refit does it later
    controls.maxDistance = Math.max(90, HOME.pos.distanceTo(HOME.target) * 1.6);
  }
  activeIdx = -1; hoverIdx = -1; explodeTarget = 0; explodeT = 0; frames = 0; stage.classList.remove('focused');
  bExplode.classList.remove('on'); bExplode.textContent = 'Explode';
  document.getElementById('titleH').textContent = NONE ? 'No outline on file for this home' : `${M.squares} squares, ${SPEC_INFO ? SPEC_INFO.style : 'hip roof'}, ${pitchGap() ? 'pitch not measured' : M.pitch}`;
  document.getElementById('titleP').textContent = NONE ? 'No building outline on file for this home, so there is no roof to draw or measure.'
    : `${SPEC.label}${DEFAULT_HOUSE ? " (stop 1 on today's route)" : ''}. Drag to turn it, click a plane to measure it.`;
}

// real outlines come in every size and shape: back the home view off until the whole plinth and roof are in frame
function fitHome() {
  const top = BASE + E + Math.max(0, ...PLANES.flatMap(P => P.pts.map(p => p.y - E)));
  const pts = [];
  FP.forEach(p => { pts.push(V(p.x, BASE, p.z), V(p.x, top, p.z)); });
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => pts.push(V(.7 + sx * PW / 2, 0, 3.4 + sz * PD / 2)));
  const p0 = camera.position.clone(), q0 = camera.quaternion.clone(), dir = HOME.pos.clone().sub(HOME.target);
  for (let i = 0; i < 40; i++) {
    camera.position.copy(HOME.target).add(dir); camera.lookAt(HOME.target); camera.updateMatrixWorld();
    if (pts.every(p => { const q = p.clone().project(camera); return Math.abs(q.x) < .9 && Math.abs(q.y) < .86; })) break;
    dir.multiplyScalar(1.05);
  }
  HOME.pos = HOME.target.clone().add(dir);
  camera.position.copy(p0); camera.quaternion.copy(q0); camera.updateMatrixWorld();
}
function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function flyTo(pos, target, dur = 1.1) { tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), dur: dur * 1000 }; window.__settled = false; }

function setMode(m) {
  mode = m;
  chips.querySelectorAll('.chip').forEach(c => { c.classList.toggle('on', c.dataset.m === m); c.setAttribute('aria-pressed', c.dataset.m === m ? 'true' : 'false'); });
  renderLegend();
}
function renderLegend() {
  const A = activeIdx >= 0 ? planeGroups[activeIdx] : null;
  if (mode === 'edges') {
    const src = A ? A.P.m.edges.reduce((o, e) => (o[e.type] = (o[e.type] || 0) + e.ft, o), {}) : M.edgeTotals;
    legend.innerHTML = EDGE_ORDER.filter(t => src[t]).map(t => `<span><i style="background:${EDGE_COL[t]}"></i>${EDGE_LABEL[t]}<b>${src[t]} ft</b></span>`).join('') + `<span class="cap">${A ? A.P.name + ', edge lengths' : 'Whole roof, shared edges counted once'}</span>`;
  } else if (mode === 'dims') legend.innerHTML = `<span><i style="background:var(--ink)"></i>Eave runs<b>${M.edgeTotals.eave} ft</b></span><span class="cap">Dimensions in feet along every eave</span>`;
  else if (mode === 'hail') legend.innerHTML = `<span><i style="background:var(--ink)"></i>Hail at this home, ${HAIL.date}<b>${HAIL.size}</b></span><span class="cap">Radar value for the whole home. Radar does not say which slopes were hit; check every plane on the inspection.</span>`;
  legend.hidden = mode === 'planes';
}
function focusPlane(i) {
  if (i < 0 || i >= planeGroups.length) return;
  activeIdx = i; stage.classList.add('focused');
  setMode('edges');
  const pg = planeGroups[i];
  const lifted = pg.centroid.clone().addScaledVector(pg.explodeDir, Math.max(explodeTarget, .5)); lifted.y += BASE;
  const view = pg.n.clone().setY(0).normalize().multiplyScalar(1).addScaledVector(pg.u, .42).add(new THREE.Vector3(0, .62, 0)).normalize();
  const dist = (isPhone ? 36 : 34) + pg.P.m.area / 46;
  const pos = lifted.clone().addScaledVector(view, dist); pos.y = Math.max(pos.y, lifted.y + 7);
  flyTo(pos, lifted, 1.0);
  if (!isPhone && window.setTab) window.setTab('meas');
  if (isPhone) { const max = document.documentElement.scrollHeight - innerHeight, top = Math.max(0, Math.min(max, Math.round(stage.getBoundingClientRect().top + scrollY - (document.querySelector('.bar').offsetHeight || 0) - 4))); if (Math.abs(scrollY - top) > 8) scrollTo(0, top); }
  renderPanel(); resize();
}
function resetView() {
  activeIdx = -1; stage.classList.remove('focused');
  if (mode === 'edges') setMode('planes'); else renderLegend();
  flyTo(HOME.pos.clone(), HOME.target.clone());
  renderPanel(); resize();
}
function planeHTML(pg) {
  const m = pg.P.m, P = pg.P;
  return `<div class="fx${P.hit ? ' hit' : ''}"><div class="fh"><i>${P.id}</i><div><b>${P.name}</b><small>${P.rise}/12 pitch, pitch factor ${m.factor.toFixed(3)}</small></div></div>
    <div class="big">${m.squares.toFixed(1)}<i>squares</i></div>
    <div class="line">${m.area.toLocaleString()} sq ft of roof from ${m.plan.toLocaleString()} sq ft of plan at ${P.rise}/12. ${Math.round(m.area / M.area * 100)}% of the roof.</div>
    <div class="edges">${m.edges.map(e => `<div><i style="background:${EDGE_COL[e.type]}"></i>${EDGE_LABEL[e.type]}<b>${e.ft} ft</b></div>`).join('')}</div>
    ${P.hit ? `<div class="hailline"><span class="ic">${I.hail}</span>${HAIL.size} hail ${HAIL.date}, ${pg.hits} marks${P.hit === 'heavy' ? ', faced the storm' : ', glancing side'}</div>` : ''}
    <button type="button" class="back" data-whole><span class="ic">${I.back}</span>Whole roof</button></div>`;
}
function renderPanel() {
  const A = activeIdx >= 0 ? planeGroups[activeIdx] : null;
  measTitle.textContent = A ? 'Plane ' + A.P.id : 'Roof';
  measPill.textContent = A ? A.P.name : 'Whole roof';
  const first = !focusEl.innerHTML; focusEl.className = 'focus'; if (!first) { void focusEl.offsetWidth; focusEl.classList.add('in'); }
  if (NONE) { focusEl.innerHTML = `<div class="tot"><div><small>Roof</small><b style="font-size:16px">No outline on file</b></div></div>`; tableEl.innerHTML = ''; return; }
  focusEl.innerHTML = A ? planeHTML(A) : `<div class="tot"><div><small>Total</small><b>${M.squares}<i>sq</i></b></div><div><small>Pitch</small><b>${pitchGap() ? 'Not measured' : M.pitch}</b></div><div><small>Planes</small><b>${M.planes.length}</b></div></div>`;
  tableEl.innerHTML = `<thead><tr><th>Plane</th><th>Pitch</th><th>Area</th><th>Squares</th></tr></thead><tbody>${PLANES.map((P, i) => `<tr data-i="${i}" class="${A && A.P === P ? 'sel' : ''}"><td>${P.name}${P.hit === 'heavy' ? '<span class="tag">hail</span>' : ''}</td><td>${P.rise}/12</td><td>${P.m.area.toLocaleString()} sq ft</td><td><b>${P.m.squares.toFixed(1)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td>${M.pitch}</td><td>${M.area.toLocaleString()} sq ft</td><td>${M.squares}</td></tr></tfoot>`;
  tableEl.querySelectorAll('tbody tr').forEach(tr => { tr.onclick = () => { const i = +tr.dataset.i; i === activeIdx ? resetView() : focusPlane(i); }; tr.onmouseenter = () => { hoverIdx = +tr.dataset.i; }; tr.onmouseleave = () => { hoverIdx = -1; }; });
  focusEl.querySelectorAll('[data-whole]').forEach(b => b.onclick = resetView);
  if (isPhone) {
    const schips = document.getElementById('schips'), dock = document.getElementById('dock');
    if (A) { sheetTitle.textContent = `${A.P.name}, ${A.P.rise}/12`; sheetBody.innerHTML = planeHTML(A); if (chips.parentNode !== schips) schips.appendChild(chips); sheet.classList.add('open'); document.body.classList.add('sheet-open'); }
    else { sheet.classList.remove('open'); document.body.classList.remove('sheet-open'); if (chips.parentNode !== dock) dock.insertBefore(chips, dock.firstChild); }
  }
}
chips.onclick = (e) => { const b = e.target.closest('.chip'); if (b) setMode(b.dataset.m); };
bWhole.onclick = resetView;
document.getElementById('sheetClose').onclick = resetView;
bExplode.onclick = () => { explodeTarget = explodeTarget ? 0 : 1; bExplode.classList.toggle('on', !!explodeTarget); bExplode.textContent = explodeTarget ? 'Assemble' : 'Explode'; };
addEventListener('keydown', e => { if (e.key === 'Escape' && activeIdx >= 0) resetView(); });

// picking
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null;
function pick(e) { const r = canvas.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, camera); const h = ray.intersectObjects(pickables, false)[0]; return h ? h.object.userData.plane : -1; }
canvas.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; hoverIdx = pick(e); canvas.style.cursor = hoverIdx >= 0 ? 'pointer' : ''; });
canvas.addEventListener('pointerleave', () => { hoverIdx = -1; });
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downAt) return; const d = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
  if (d < 6) { const i = pick(e); if (i >= 0) { i === activeIdx ? resetView() : focusPlane(i); } else if (activeIdx >= 0) resetView(); }
});
controls.addEventListener('start', () => { tween = null; });

// ---------- resize + loop ----------
function resize() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; const shift = isPhone ? (activeIdx >= 0 ? h * .22 : -h * .05) : (activeIdx >= 0 ? h * .04 : -h * .02); camera.setViewOffset(w, h, 0, shift, w, h); camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const tmpV = new THREE.Vector3(), col = new THREE.Color(), tmpC = new THREE.Color();
last = performance.now();
const W2 = () => stage.clientWidth, H2 = () => stage.clientHeight;
function project(p) { const q = p.clone().project(camera); return { x: (q.x * .5 + .5) * W2(), y: (-q.y * .5 + .5) * H2(), z: q.z }; }
let sheetTop = 1e9, stageTop = 0;
function place(el, p, show) { if (show && isPhone && activeIdx >= 0 && stageTop + p.y > sheetTop - 14) show = false; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.opacity = show ? 1 : 0; el.style.visibility = show ? 'visible' : 'hidden'; }
function declutter(els) {
  const boxes = [];
  els.forEach(el => {
    if (el.style.visibility !== 'visible') return;
    const w = el._w || (el._w = el.offsetWidth), h = el._h || (el._h = el.offsetHeight);
    const x = parseFloat(el.style.left) - w / 2, y = parseFloat(el.style.top) - h / 2;
    if (boxes.some(b => x < b.x + b.w + 3 && x + w + 3 > b.x && y < b.y + b.h + 3 && y + h + 3 > b.y)) { el.style.visibility = 'hidden'; el.style.opacity = 0; }
    else boxes.push({ x, y, w, h });
  });
}
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  stageTop = stage.getBoundingClientRect().top; sheetTop = isPhone && activeIdx >= 0 ? sheet.getBoundingClientRect().top : 1e9;
  explodeT += (explodeTarget - explodeT) * Math.min(1, dt * 4.5);
  if (tween) { const k = Math.min(1, (now - tween.start) / tween.dur), e = ease(k); camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e); if (k >= 1) { tween = null; window.__settled = true; } }
  controls.update();
  const camDir = camera.position.clone();
  let anyLift = explodeT;
  planeGroups.forEach((pg, i) => {
    const isA = i === activeIdx, isHit = !!pg.P.hit;
    const wantLift = Math.max(explodeT, isA ? .5 : 0);
    pg.lift += (wantLift - pg.lift) * Math.min(1, dt * 5); anyLift = Math.max(anyLift, pg.lift);
    pg.g.position.copy(pg.explodeDir).multiplyScalar(pg.lift);
    pg.ghostMat.opacity = .55 * Math.min(1, pg.lift * 2.2);
    const wantA = isA ? 1 : 0, wantH = i === hoverIdx && !isA ? 1 : 0;
    const changed = Math.abs(pg.act - wantA) > .002 || Math.abs(pg.hover - wantH) > .002 || frames < 2;
    pg.act += (wantA - pg.act) * Math.min(1, dt * 7); pg.hover += (wantH - pg.hover) * Math.min(1, dt * 9);
    if (changed) {
      const red = pg.P.hit === 'heavy' ? 1 : 0;
      pg.baseCols.forEach((b, k) => {
        const l = b.c.getHSL({}).l; tmpC.copy(b.hit ? RED_HIT : RED).offsetHSL(0, 0, (l - .34) * .45);
        col.copy(b.c).lerp(tmpC, red); col.offsetHSL(0, 0, pg.hover * .11 + pg.act * .06); pg.inst.setColorAt(k, col);
      });
      pg.inst.instanceColor.needsUpdate = true;
      pg.mat.metalness = .74 - .40 * red; pg.mat.roughness = .34 + .14 * red; pg.mat.envMapIntensity = 1 - .7 * red; pg.mat.emissive.setRGB(.025 * red, 0, 0);
      pg.slab.material.color.copy(SLAB_BASE).lerp(SLAB_RED, red);
      pg.trim.color.copy(TRIM_BASE).lerp(TRIM_ACTIVE, Math.max(pg.act, pg.hover * .55));
    }
    if (pg.marks) pg.marks.material.opacity = mode === 'hail' ? .92 : 0;
    pg.edgeG.visible = mode === 'edges' && (activeIdx < 0 || isA);

    // plane pin at the centroid
    tmpV.copy(pg.centroid).add(pg.g.position).addScaledVector(pg.n, .35); tmpV.y += BASE;
    const facing = pg.n.dot(camDir.clone().sub(tmpV).normalize());
    const c2 = project(tmpV);
    place(pg.pin, c2, mode === 'planes' && !isA && facing > .08);
    if (pg.hpin) place(pg.hpin, { x: c2.x, y: c2.y - 10 }, mode === 'hail' && facing > .05);
    // edge pins only for the focused plane in edges mode
    pg.epins.forEach((el, k) => {
      const e = pg.P.m.edges[k];
      tmpV.copy(e.a).add(e.b).multiplyScalar(.5).add(pg.g.position).addScaledVector(pg.n, .45); tmpV.y += BASE;
      place(el, project(tmpV), isA && mode === 'edges');
    });
  });
  // declutter: a label that would sit on top of a bigger plane's label waits until the view turns
  declutter(planeGroups.slice().sort((a, b) => b.P.m.area - a.P.m.area).map(pg => pg.pin));
  if (activeIdx >= 0) declutter(planeGroups[activeIdx].epins);
  dimsG.visible = mode === 'dims';
  DIMS.forEach(d => { const toCam = camera.position.clone().sub(d.mid).setY(0).normalize(); const far = Math.max(0, -d.nrm.dot(toCam)); tmpV.copy(d.mid).addScaledVector(d.nrm, d.off + far * 3.4); tmpV.y += BASE - .15; place(d.pin, project(tmpV), mode === 'dims'); });
  const capWant = mode === 'edges' ? 0 : Math.max(0, 1 - explodeT * 1.6); capMat.opacity += (capWant - capMat.opacity) * Math.min(1, dt * 8); caps.visible = capMat.opacity > .02;

  renderer.render(scene, camera);
  frames++;
  if (frames === 8) { window.__ready = true; window.__settled = !tween; }
  requestAnimationFrame(frame);
}
build();
camera.position.copy(HOME.pos).multiplyScalar(1.22).add(V(0, 3, 0)); controls.target.copy(HOME.target);
setMode('planes'); renderPanel();
flyTo(HOME.pos.clone(), HOME.target.clone(), 1.5);
// another home: quick crossfade, rebuild the roof in place, fly back to the home view
window.__switchHome = () => {
  stage.classList.add('swap');
  setTimeout(() => {
    build(); setMode('planes'); renderPanel(); resize();
    flyTo(HOME.pos.clone(), HOME.target.clone(), 1.0);
    requestAnimationFrame(() => stage.classList.remove('swap'));
  }, 200);
};
{ const sw = window.__switchHome; window.__switchHome = () => preloadMap(window.HOME).then(sw, sw); }
// the stage moved to another column (the CRM's home pane, or back to the record): size to it and fit the whole house again
window.__refit = () => { if (!stage.clientWidth || !stage.clientHeight) return; resize(); if (FPB && HOME0) { HOME.pos = HOME0.pos.clone(); HOME.target = HOME0.target.clone(); fitHome(); controls.maxDistance = Math.max(90, HOME.pos.distanceTo(HOME.target) * 1.6); } flyTo(HOME.pos.clone(), HOME.target.clone(), .6); };
requestAnimationFrame(frame);

// capture hooks: ?plane=A  ?mode=edges|dims|hail  ?explode=1
const q = new URLSearchParams(location.search);
window.focusPlane = focusPlane;
window.__planeScreen = (i) => { const pg = planeGroups[i]; const v = pg.centroid.clone().add(pg.g.position); v.y += BASE; const p = project(v); const r = canvas.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y, n: planeGroups.length, id: pg.P.id }; }; window.resetView = resetView; window.setMode = setMode;
setTimeout(() => {
  if (q.get('explode')) bExplode.click();
  const pl = q.get('plane'); if (pl) { const i = PLANES.findIndex(P => P.id === pl); if (i >= 0) focusPlane(i); }
  const m = q.get('mode'); if (m) setMode(m);
}, 300);
