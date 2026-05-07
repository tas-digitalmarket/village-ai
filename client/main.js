// main.js — Realistic Three.js scene with PBR lighting + post-processing
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld } from './world.js?v=4';
import { Villager } from './character.js?v=4';
import { WeatherFX } from './weather-fx.js?v=4';
import { HUD } from './hud.js?v=4';
import { CreatorPanel } from './creator.js?v=4';

// ── Renderer ─────────────────────────────────────────────────
const canvas = document.getElementById('world-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ── Scene ─────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a); // slate-900
scene.fog = new THREE.FogExp2(0x0f172a, 0.009);

// ── Camera ────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(14, 16, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 4;
controls.maxDistance = 70;
controls.target.set(0, 0, 2); 

// ── Lights ────────────────────────────────────────────────────
const hemiLight = new THREE.HemisphereLight(0xc8e8ff, 0x8a6040, 0.6);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff5cc, 2.0);
sunLight.position.set(20, 35, 15);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x8899cc, 0.4);
fillLight.position.set(-15, 10, -10);
scene.add(fillLight);

const moonLight = new THREE.DirectionalLight(0x4466aa, 0.0);
moonLight.position.set(-20, 25, -10);
scene.add(moonLight);

// ── Realistic Bedside Lamp inside house ─────────────────
const nightLamp = new THREE.PointLight(0xff9944, 0.0, 9, 1.6);
nightLamp.position.set(-3.4, 2.0, -10.5);
scene.add(nightLamp);

const lampGroup = new THREE.Group();
lampGroup.position.set(-3.4, 0.41, -10.5);

// Nightstand
const nsMat  = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.85 });
const nsTop  = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.36), nsMat);
nsTop.position.y = 0.62;
lampGroup.add(nsTop);
[[-0.14,-0.14],[0.14,-0.14],[-0.14,0.14],[0.14,0.14]].forEach(([dx,dz]) => {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.62, 0.04), nsMat);
  leg.position.set(dx, 0.31, dz);
  lampGroup.add(leg);
});

// Lamp base (flat disc)
const metMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.3, metalness: 0.7 });
const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.025, 10), metMat);
lampBase.position.y = 0.655;
lampGroup.add(lampBase);

// Lamp pole
const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.32, 8), metMat);
lampPole.position.y = 0.83;
lampGroup.add(lampPole);

// Lampshade (truncated cone, open bottom, DoubleSide)
const shadeMat = new THREE.MeshStandardMaterial({
  color: 0xf5e0be, roughness: 0.9, side: THREE.DoubleSide,
  emissive: 0xff9944, emissiveIntensity: 0
});
const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.07, 0.16, 12, 1, true), shadeMat);
lampShade.position.y = 0.995;
lampGroup.add(lampShade);

// Shade top cap
const capMat = new THREE.MeshStandardMaterial({ color: 0xf5e0be, roughness: 0.9 });
const shadeCap = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), capMat);
shadeCap.rotation.x = -Math.PI / 2;
shadeCap.position.y = 1.075;
lampGroup.add(shadeCap);

// Glowing bulb inside shade
const bulbMat = new THREE.MeshStandardMaterial({
  color: 0xffdd88, emissive: 0xffdd88, emissiveIntensity: 0
});
const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), bulbMat);
bulbMesh.position.y = 0.97;
lampGroup.add(bulbMesh);

scene.add(lampGroup);

// ── Post-processing ───────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.18, 0.5, 0.82
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ── Components ───────────────────────────────────────────────
buildWorld(scene);
const villager = new Villager(scene);
const weatherFX = new WeatherFX(scene, camera);
const hud = new HUD();
window.hud = hud; // EXPORT to window for interpolation
const creator = new CreatorPanel((directives) => hud.updateSchedule(directives));

// ── Sky / Day-Night Helpers ───────────────────────────────────
let worldHour = 6;

const SKY_PRESETS = {
  night: { sky: 0x050d1e, fog: 0x0a0f1a, sun: 0.0, amb: 0.28, hemi: 0.22, moon: 0.80 },
  dawn:  { sky: 0x1a2a6c, fog: 0xd4622a, sun: 0.7, amb: 0.25, hemi: 0.35, moon: 0.0  },
  day:   { sky: 0x5ba3d9, fog: 0x87ceeb, sun: 2.0, amb: 0.55, hemi: 0.65, moon: 0.0  },
  dusk:  { sky: 0x1a1a4a, fog: 0xc0581a, sun: 0.5, amb: 0.2,  hemi: 0.3,  moon: 0.0  },
};

function lerpPreset(a, b, t) {
  const lerp = (x,y) => x + (y-x)*t;
  return {
    sky:  new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), t),
    fog:  new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), t),
    sun:  lerp(a.sun,  b.sun),
    amb:  lerp(a.amb,  b.amb),
    hemi: lerp(a.hemi, b.hemi),
    moon: lerp(a.moon, b.moon)
  };
}

function updateSky(hour) {
  let p;
  if      (hour < 5)  p = SKY_PRESETS.night;
  else if (hour < 7)  p = lerpPreset(SKY_PRESETS.night, SKY_PRESETS.dawn,  (hour-5)/2);
  else if (hour < 9)  p = lerpPreset(SKY_PRESETS.dawn,  SKY_PRESETS.day,   (hour-7)/2);
  else if (hour < 18) p = SKY_PRESETS.day;
  else if (hour < 20) p = lerpPreset(SKY_PRESETS.day,   SKY_PRESETS.dusk,  (hour-18)/2);
  else if (hour < 22) p = lerpPreset(SKY_PRESETS.dusk,  SKY_PRESETS.night, (hour-20)/2);
  else                p = SKY_PRESETS.night;

  scene.background = p.sky instanceof THREE.Color ? p.sky : new THREE.Color(p.sky);
  scene.fog.color.copy(scene.background);

  sunLight.intensity  = p.sun;
  fillLight.intensity = p.amb;
  hemiLight.intensity = p.hemi;
  moonLight.intensity = p.moon;

  // Night lamp: glow inside house when dark (after 21:00 or before 6:00)
  const isNight = hour > 21 || hour < 6;
  nightLamp.intensity = isNight ? 1.8 : 0.0;
  shadeMat.emissiveIntensity = isNight ? 0.55 : 0.0;
  bulbMat.emissiveIntensity  = isNight ? 3.5  : 0.0;

  const isDusk = hour > 17.5 && hour < 21;
  const isDawn = hour > 5 && hour < 9;
  bloom.strength = (isDusk || isDawn) ? 0.45 : 0.18;
  bloom.threshold = (isDusk || isDawn) ? 0.7 : 0.82;

  scene.traverse((o) => {
    if (o.userData.isStars && o.material) {
      o.material.opacity = hour < 6 || hour > 20 ? 1 : 0;
      o.material.transparent = true;
    }
  });

  const angle = ((hour - 6) / 12) * Math.PI;
  sunLight.position.set(Math.cos(angle)*35, Math.max(2, Math.sin(angle)*35), 15);
  moonLight.position.set(-Math.cos(angle)*25, Math.max(2, -Math.sin(angle)*25), -10);
  renderer.toneMappingExposure = hour >= 6 && hour <= 18 ? 1.2 : 0.85;
}

// ── WebSocket with auto-reconnect ────────────────────────────
let ws = null;
let wsReconnectDelay = 2000;
let wsConnected = false;

function applyState(d) {
  if (d.world_time) {
    const [h, m] = d.world_time.split(':').map(Number);
    const serverHour = h + m / 60;
    // Only snap if the difference is significant (>2 mins) to avoid micro-jumps
    if (Math.abs(worldHour - serverHour) > 0.04) {
      worldHour = serverHour;
    }
    hud.setTime(d.world_time, h);
  }
  villager.setState(d);
  if (d.weather) weatherFX.setWeather(d.weather);
  hud.update(d);

  // Update the upcoming schedule panel if data is included in state
  if (d.upcomingSchedule) {
    hud.updateSchedule(d.upcomingSchedule);
  }

  const ls = document.getElementById('loading-screen');
  if (ls && !ls.classList.contains('hidden')) {
    setTimeout(() => ls.classList.add('hidden'), 400);
  }
}

async function fetchStateFallback() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) return;
    const d = await res.json();
    applyState(d);
  } catch (e) { console.warn('[REST] Fallback failed:', e.message); }
}

async function fetchDirectivesFallback() {
  try {
    const res = await fetch('/api/directives');
    if (!res.ok) return;
    const d = await res.json();
    hud.updateSchedule(d);
  } catch (e) { console.warn('[REST] Directives failed:', e.message); }
}

function connectWS() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${wsProtocol}//${location.host}`);

  ws.onopen = () => {
    console.log('[WS] Connected');
    wsConnected = true;
    wsReconnectDelay = 2000;
    hud.setConnected(true);
    fetchDirectivesFallback(); // ensure directives are sync'd
  };

  ws.onclose = () => {
    wsConnected = false;
    hud.setConnected(false);
    setTimeout(connectWS, wsReconnectDelay);
    wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, 30000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'state') applyState(msg.data);
      if (msg.type === 'directives') hud.updateSchedule(msg.data);
      if (msg.type === 'creator_message') creator.onNewMessage(msg.data.arash_response);
    } catch (e) { /* ignore */ }
  };
}

connectWS();
setTimeout(() => { if (!wsConnected) fetchStateFallback(); }, 4000);
setInterval(() => { if (!wsConnected) { fetchStateFallback(); fetchDirectivesFallback(); } }, 10000);

// ── View Toggle Logic ─────────────────────────────────────────
let isInterior = false;
const viewBtn = document.getElementById('view-toggle');
if (viewBtn) {
  viewBtn.onclick = () => {
    isInterior = !isInterior;
    viewBtn.innerHTML = isInterior ? '<span>🌳</span> View Farm' : '<span>🏠</span> View Inside';
  };
}

updateSky(6);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ── Animation Loop ─────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  controls.update();
  villager.update(delta, clock.getElapsedTime());
  weatherFX.update(delta, clock.getElapsedTime());

  const vPos = villager.currentPos;
  const inHouse = vPos.z < -5.5 && Math.abs(vPos.x) < 3.5;
  const showInterior = isInterior || inHouse;

  if (showInterior) {
    controls.target.lerp(new THREE.Vector3(0, 1.2, -8), 0.08);
    if (camera.position.distanceTo(new THREE.Vector3(0, 2, -5)) > 5) {
       camera.position.lerp(new THREE.Vector3(3.5, 3.5, -4), 0.04);
    }
    controls.maxDistance = 10;
  } else {
    controls.target.lerp(new THREE.Vector3(vPos.x, 0.5, vPos.z), 0.05);
    controls.maxDistance = 70;
  }

  // World clock interpolation:
  // Server is 30 game-mins per 60 real-seconds (0.5 hrs/min).
  // We interpolate slightly slower (0.48) so the server tick (every 20s) always pushes us forward.
  worldHour += delta * (0.48 / 60);
  if (worldHour >= 24) worldHour = 0;

  // Smoothly update HUD time so user sees minutes passing
  const currentH = Math.floor(worldHour);
  const currentM = Math.floor((worldHour - currentH) * 60);
  const timeStr = `${currentH.toString().padStart(2, '0')}:${currentM.toString().padStart(2, '0')}`;
  if (window.hud && typeof window.hud.setTime === 'function') {
    window.hud.setTime(timeStr, currentH);
  }
  updateSky(worldHour);

  composer.render();
}
animate();
