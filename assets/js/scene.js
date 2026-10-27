import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const S3 = window.SCENE3D;
const loader = document.getElementById('loader');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowPower = matchMedia('(pointer: coarse)').matches;

try {
  if (document.fonts) await Promise.race([Promise.all([
    document.fonts.load('600 120px "Be Vietnam Pro"'),
    document.fonts.load('500 96px "Be Vietnam Pro"'),
    document.fonts.load('500 30px "Be Vietnam Pro"')
  ]), new Promise(r => setTimeout(r, 2500))]);
} catch (_) {}

/* ---------- renderer ---------- */
const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) { loader.classList.add('hide'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1.75 : 2));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0, 11);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
const key = new THREE.DirectionalLight(0xfff1df, 2.2); key.position.set(-4, 6, 6); scene.add(key);
const fill = new THREE.DirectionalLight(0xdce9ee, 0.9); fill.position.set(5, -2, 4); scene.add(fill);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

/* ---------- helpers ---------- */
function radialTexture(stops){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => r.addColorStop(o, col)); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const shadowTex = radialTexture([[0, 'rgba(40,30,20,.55)'], [1, 'rgba(40,30,20,0)']]);
const glowTex = radialTexture([[0, 'rgba(255,236,196,.95)'], [.35, 'rgba(232,200,140,.45)'], [1, 'rgba(232,200,140,0)']]);
const dotTex = radialTexture([[0, 'rgba(255,255,255,1)'], [.5, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);
function spaced(g, text, cx, y, sp){
  const chars = [...text], w = chars.map(ch => g.measureText(ch).width);
  const total = w.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let x = cx - total / 2; g.save(); g.textAlign = 'left';
  chars.forEach((ch, i) => { g.fillText(ch, x, y); x += w[i] + sp; }); g.restore();
}

/* ---------- bottles ---------- */
function makeLabel(o){
  const c = document.createElement('canvas'); c.width = 2048; c.height = 800;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 800); bg.addColorStop(0, o.bg1); bg.addColorStop(1, o.bg2);
  g.fillStyle = bg; g.fillRect(0, 0, 2048, 800);
  g.save(); g.globalAlpha = .1; g.strokeStyle = o.accent; g.lineWidth = 1.5;
  for (let k = 0; k < 16; k++){ g.beginPath(); for (let x = 0; x <= 2048; x += 8){ const y = 400 + Math.sin(x / 70 + k * .4) * (120 + k * 14); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  g.restore();
  g.fillStyle = bg; g.fillRect(700, 0, 648, 800);
  g.fillStyle = o.accent; g.fillRect(0, 60, 2048, 3); g.fillRect(0, 74, 2048, 1); g.fillRect(0, 737, 2048, 3); g.fillRect(0, 726, 2048, 1);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '500 28px "Be Vietnam Pro", sans-serif'; spaced(g, 'MADE IN JAPAN · CLASTIVE', 1024, 150, 12);
  g.fillStyle = o.ink; g.font = '600 ' + o.titleSize + 'px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(o.title, 1024, 300);
  g.fillStyle = o.accent; g.font = '500 ' + o.subSize + 'px "Be Vietnam Pro", system-ui, sans-serif'; g.fillText(o.sub, 1024, 450);
  g.fillRect(974, 545, 100, 2);
  g.fillStyle = o.ink; g.globalAlpha = .8; g.font = '400 28px "Be Vietnam Pro", sans-serif'; spaced(g, o.line, 1024, 620, 6);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function makeBottle(o){
  const inner = new THREE.Group();
  const prof = [[0,0],[.62,0],[.77,.05],[.83,.18],[.83,2.33],[.79,2.55],[.62,2.74],[.46,2.84],[.43,2.9],[.43,3.08],[0,3.08]].map(p => new THREE.Vector2(p[0], p[1]));
  inner.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 128), new THREE.MeshPhysicalMaterial({
    color: o.glass, roughness: o.rough, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, sheen: o.sheen || 0, sheenColor: new THREE.Color(0xffffff), envMapIntensity: 1.1 })));
  const label = new THREE.Mesh(new THREE.CylinderGeometry(.836, .836, 1.66, 128, 1, true, Math.PI, Math.PI * 2),
    new THREE.MeshPhysicalMaterial({ map: o.label, roughness: .5, clearcoat: .5, clearcoatRoughness: .35 }));
  label.position.y = 1.25; inner.add(label);
  const metal = new THREE.MeshPhysicalMaterial({ color: o.cap, metalness: 1, roughness: .22, clearcoat: .6, clearcoatRoughness: .2, envMapIntensity: 1.4 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .62, 128), metal); cap.position.y = 3.2; inner.add(cap);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(.445, .055, 24, 128), metal); lip.rotation.x = Math.PI / 2; lip.position.y = 3.51; inner.add(lip);
  for (let i = 0; i < 4; i++){ const r = new THREE.Mesh(new THREE.TorusGeometry(.503, .01, 8, 128), metal); r.rotation.x = Math.PI / 2; r.position.y = 2.96 + i * .1; inner.add(r); }
  const band = new THREE.Mesh(new THREE.TorusGeometry(.44, .018, 12, 128), metal); band.rotation.x = Math.PI / 2; band.position.y = 2.87; inner.add(band);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(1.35, 48), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = -.01; inner.add(sh);
  inner.position.y = -1.75;
  const holder = new THREE.Group(); holder.add(inner); return holder;
}
const bottleA = makeBottle({ glass: 0xf8f6f1, rough: .32, sheen: .4, cap: 0xc9a46c,
  label: makeLabel({ bg1: '#fdfbf7', bg2: '#efe8db', accent: '#a3804c', ink: '#13202a', title: 'PURE NMN', titleSize: 112, sub: '12,000mg+', subSize: 84, line: '60 CAPSULES · NMN' }) });
const bottleB = makeBottle({ glass: 0x5c1a2c, rough: .12, cap: 0xe2bca2,
  label: makeLabel({ bg1: '#4a1424', bg2: '#2c0b16', accent: '#e6bfa6', ink: '#fbf0ea', title: 'NMN', titleSize: 168, sub: 'Regene', subSize: 104, line: '90 CAPSULES · NMN' }) });
scene.add(bottleA, bottleB);

/* ---------- pearl cell ---------- */
const orb = new THREE.Group();
const seg = lowPower ? 64 : 96;
const shellGeo = new THREE.SphereGeometry(1.5, seg, seg);
const basePos = shellGeo.attributes.position.array.slice();
const shell = new THREE.Mesh(shellGeo, new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: .1, metalness: 0, clearcoat: 1, clearcoatRoughness: .05,
  iridescence: 1, iridescenceIOR: 1.33, iridescenceThicknessRange: [140, 720], transparent: true, opacity: .62, depthWrite: false, envMapIntensity: 1.3 }));
orb.add(shell);
const nucleus = new THREE.Mesh(new THREE.SphereGeometry(.52, 48, 48), new THREE.MeshPhysicalMaterial({ color: 0xdcbb82, emissive: 0xa3804c, emissiveIntensity: .45, roughness: .3, metalness: .4, clearcoat: 1 }));
orb.add(nucleus);
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: .75 }));
glow.scale.setScalar(2.6); orb.add(glow);
const rings = [];
const ringMatGold = new THREE.MeshPhysicalMaterial({ color: 0xc8a66f, metalness: 1, roughness: .25 });
const ringMatTeal = new THREE.MeshPhysicalMaterial({ color: 0x2c6a6d, metalness: .3, roughness: .3, clearcoat: 1 });
const beadGeo = new THREE.SphereGeometry(.06, 20, 14);
[[.5, .2, 2.15, ringMatGold, 12], [-.6, .9, 2.45, ringMatTeal, 10], [1.25, -.4, 2.75, ringMatGold, 14]].forEach(([rx, rz, rad, mat, n], idx) => {
  const tilt = new THREE.Group(); tilt.rotation.set(rx, 0, rz);
  const spin = new THREE.Group(); tilt.add(spin);
  const line = new THREE.Mesh(new THREE.TorusGeometry(rad, .004, 6, 200), new THREE.MeshBasicMaterial({ color: 0xa3804c, transparent: true, opacity: .35 }));
  line.rotation.x = Math.PI / 2; spin.add(line);
  for (let i = 0; i < n; i++){ const a = i / n * Math.PI * 2; const b = new THREE.Mesh(beadGeo, mat); b.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad); b.scale.setScalar(.7 + ((i * 7) % 5) * .15); spin.add(b); }
  orb.add(tilt); rings.push({ spin, speed: .25 + idx * .08, dir: idx % 2 ? -1 : 1 });
});
scene.add(orb);

/* ---------- DNA helix ---------- */
const helix = new THREE.Group();
const PAIRS = 46, HH = 7.2, R = .95;
const nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(.12, 24, 16), new THREE.MeshPhysicalMaterial({ roughness: .25, metalness: .35, clearcoat: 1 }), PAIRS * 2);
const rungs = new THREE.InstancedMesh(new THREE.CylinderGeometry(.022, .022, 1, 10), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .3, metalness: .2, clearcoat: 1 }), PAIRS);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
const cGold = new THREE.Color(0xc8a66f), cTeal = new THREE.Color(0x2c6a6d);
for (let i = 0; i < PAIRS; i++){
  const y = (i / (PAIRS - 1) - .5) * HH, a = i * .43;
  const p1 = new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R), p2 = new THREE.Vector3(-Math.cos(a) * R, y, -Math.sin(a) * R);
  m4.makeTranslation(p1.x, p1.y, p1.z); nodes.setMatrixAt(i * 2, m4); nodes.setColorAt(i * 2, cGold);
  m4.makeTranslation(p2.x, p2.y, p2.z); nodes.setMatrixAt(i * 2 + 1, m4); nodes.setColorAt(i * 2 + 1, cTeal);
  const d = new THREE.Vector3().subVectors(p2, p1), len = d.length();
  q.setFromUnitVectors(up, d.normalize());
  m4.compose(new THREE.Vector3().addVectors(p1, p2).multiplyScalar(.5), q, new THREE.Vector3(1, len, 1)); rungs.setMatrixAt(i, m4);
}
nodes.instanceMatrix.needsUpdate = true; nodes.instanceColor.needsUpdate = true; rungs.instanceMatrix.needsUpdate = true;
function strand(phase, color){
  const pts = []; for (let i = 0; i <= 200; i++){ const t = i / 200, y = (t - .5) * HH, a = t * (PAIRS - 1) * .43 + phase; pts.push(new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R)); }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, .035, 10, false), new THREE.MeshPhysicalMaterial({ color, metalness: .6, roughness: .25, clearcoat: 1 }));
}
helix.add(nodes, rungs, strand(0, 0xc8a66f), strand(Math.PI, 0x2c6a6d));
helix.rotation.z = .35;
scene.add(helix);

/* ---------- particles ---------- */
const N = lowPower ? 500 : 900, pPos = new Float32Array(N * 3), pCol = new Float32Array(N * 3);
for (let i = 0; i < N; i++){
  pPos[i*3] = (Math.random() - .5) * 26; pPos[i*3+1] = (Math.random() - .5) * 18; pPos[i*3+2] = (Math.random() - .5) * 12 - 4;
  const c = Math.random() < .7 ? cGold : cTeal; pCol[i*3] = c.r; pCol[i*3+1] = c.g; pCol[i*3+2] = c.b;
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .07, map: dotTex, vertexColors: true, transparent: true, opacity: .55, depthWrite: false }));
scene.add(particles);

/* ---------- sizing: canvas is 100lvh, so mobile URL-bar show/hide doesn't resize the GL buffer ---------- */
let lastW = 0, lastH = 0;
function size(){
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h || (w === lastW && h === lastH)) return;
  lastW = w; lastH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = S3.fov(); camera.updateProjectionMatrix();
}
addEventListener('resize', size); addEventListener('orientationchange', () => setTimeout(size, 200));

/* ---------- animation ---------- */
const cache = {};
function place(obj, name, s, k){
  const target = S3.at(name, s);
  const c = cache[name] || (cache[name] = target.slice());
  for (let i = 0; i < 4; i++) c[i] += (target[i] - c[i]) * k;
  obj.position.set(c[0], c[1], c[2]); obj.scale.setScalar(Math.max(c[3], .0001)); obj.visible = c[3] > .01;
  return c;
}
let mx = 0, my = 0, tx = 0, ty = 0;
addEventListener('pointermove', e => { if (e.pointerType === 'mouse'){ tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; } }, { passive: true });

const clock = new THREE.Clock();
let sSmooth = S3.index(), active = false;
function shouldRun(){ return !document.hidden && document.body.dataset.view === 'home'; }
function setActive(){
  const want = shouldRun();
  if (want && !active){ active = true; clock.getDelta(); size(); sSmooth = S3.index(); for (const k in cache) delete cache[k]; requestAnimationFrame(loop); }
  active = want;
}
document.addEventListener('visibilitychange', setActive);
addEventListener('viewchange', setActive);

function loop(){
  if (!active) return;
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  const k = reduceMotion ? 1 : .07, motion = reduceMotion ? 0 : 1;
  sSmooth += (S3.index() - sSmooth) * k;
  const s = sSmooth;

  place(bottleA, 'A', s, k); place(bottleB, 'B', s, k);
  const turn = s * Math.PI * 2; // one full turn per section; label faces the viewer at each section
  bottleA.rotation.set(.08 + Math.sin(t * .6) * .035 * motion, -.3 + Math.sin(t * .45) * .28 * motion + turn, -.05);
  bottleB.rotation.set(.08 + Math.cos(t * .6) * .035 * motion, .3 + Math.sin(t * .45 + 1.4) * .28 * motion - turn, .05);
  bottleA.position.y += Math.sin(t * 1.1) * .05 * motion;
  bottleB.position.y += Math.cos(t * 1.1) * .05 * motion;

  place(orb, 'orb', s, k);
  if (orb.visible){
    if (motion){
      const pos = shellGeo.attributes.position.array, amp = .045;
      for (let i = 0; i < pos.length; i += 3){
        const x = basePos[i], y = basePos[i + 1], z = basePos[i + 2];
        const f = 1 + Math.sin(x * 2.1 + t * .9) * Math.sin(y * 2.4 + t * 1.1) * Math.sin(z * 1.8 + t * .7) * amp;
        pos[i] = x * f; pos[i + 1] = y * f; pos[i + 2] = z * f;
      }
      shellGeo.attributes.position.needsUpdate = true; shellGeo.computeVertexNormals();
    }
    shell.rotation.y = t * .08;
    nucleus.scale.setScalar(1 + Math.sin(t * 1.6) * .04 * motion);
    const focus = Math.max(0, 1 - Math.abs(s - 3));   // NMN → NAD+ section
    rings.forEach(r => { r.spin.rotation.y += dt * r.speed * r.dir * (1 + focus * 2.2) * (motion || .2); r.spin.scale.setScalar(1 - focus * .28); });
    glow.material.opacity = .6 + focus * .35;
  }
  place(helix, 'helix', s, k);
  if (helix.visible) helix.rotation.y = t * .35 + s * 1.2;
  particles.rotation.y = t * .01 + s * .07;
  particles.position.y = -s * .5;

  mx += (tx - mx) * .05; my += (ty - my) * .05;
  camera.position.x = mx * .9; camera.position.y = -my * .6; camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
size();
setActive();
setTimeout(() => loader.classList.add('hide'), 200);
