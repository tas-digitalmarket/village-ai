// world.js — Realistic PBR Farm World with Interior and Motorcycle
import * as THREE from 'three';

// ── Canvas Texture Generators ─────────────────────────────────
function makeGrassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a6b28'; ctx.fillRect(0,0,512,512);
  for (let i = 0; i < 8000; i++) {
    const x = Math.random()*512, y = Math.random()*512;
    const g = Math.floor(80 + Math.random()*60);
    ctx.fillStyle = `rgb(${20+Math.random()*30},${g},${15+Math.random()*20})`;
    ctx.fillRect(x, y, 1+Math.random()*2, 1+Math.random()*3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12,12); return t;
}

function makeDirtTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6b3d1e'; ctx.fillRect(0,0,256,256);
  for (let i = 0; i < 3000; i++) {
    const x = Math.random()*256, y = Math.random()*256;
    const v = Math.floor(Math.random()*40 - 20);
    ctx.fillStyle = `rgb(${107+v},${61+v},${30+v})`;
    ctx.fillRect(x, y, 2+Math.random()*3, 1+Math.random()*2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4,4); return t;
}

function makeWoodTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8B5E3C'; ctx.fillRect(0,0,256,256);
  for (let y = 0; y < 256; y += 6) {
    const v = Math.floor(Math.random()*25 - 12);
    ctx.fillStyle = `rgba(${40+v},${20+v},${10+v},0.35)`;
    ctx.fillRect(0, y, 256, 3+Math.random()*3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2,2); return t;
}

function makeStoneTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a8070'; ctx.fillRect(0,0,256,256);
  for (let i = 0; i < 2000; i++) {
    const x = Math.random()*256, y = Math.random()*256;
    const v = Math.floor(Math.random()*50 - 25);
    ctx.fillStyle = `rgba(${138+v},${128+v},${112+v},0.4)`;
    ctx.fillRect(x, y, 2+Math.random()*4, 1+Math.random()*3);
  }
  const t = new THREE.CanvasTexture(c); return t;
}

function makeRoofTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7a3d2a'; ctx.fillRect(0,0,256,256);
  for (let y = 0; y < 256; y += 16) {
    ctx.fillStyle = `rgba(0,0,0,0.2)`; ctx.fillRect(0, y, 256, 2);
    for (let x = (Math.floor(y/16)%2)*8; x < 256; x += 16) {
      ctx.fillStyle = `rgba(0,0,0,0.1)`; ctx.fillRect(x, y, 2, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3,3); return t;
}

// ── Main Builder ──────────────────────────────────────────────
export function buildWorld(scene) {
  buildGround(scene);
  buildPath(scene);
  buildCottage(scene, 0, 0, -8);
  buildFarm(scene);
  buildTrees(scene);
  buildWell(scene, 6, 0, 2);
  buildFence(scene);
  buildHaystacks(scene);
  buildStarField(scene);
  
  // New Items
  buildMotorcycle(scene, 4, 0, -4);
  buildAxeArea(scene, -3.0, 0, 3.5);

  return {};
}

function buildGround(scene) {
  const geo = new THREE.PlaneGeometry(100, 100, 30, 30);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, (Math.random() - 0.5) * 0.2);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: makeGrassTexture(), roughness: 0.95, metalness: 0.0, color: 0xffffff
  }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  scene.add(m);
}

function buildPath(scene) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 16),
    new THREE.MeshStandardMaterial({ map: makeDirtTexture(), roughness: 0.9 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.01, 3);
  m.receiveShadow = true;
  scene.add(m);
}

function buildCottage(scene, x, y, z) {
  const wallMat  = new THREE.MeshStandardMaterial({ color: 0xe8dcc9, roughness: 0.9, side: THREE.DoubleSide });
  const stoneMat = new THREE.MeshStandardMaterial({ map: makeStoneTexture(), roughness: 0.95 });
  const roofMat  = new THREE.MeshStandardMaterial({ map: makeRoofTexture(), roughness: 0.85 });
  const doorMat  = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), roughness: 0.8, color: 0x7a4a2a });
  const winMat   = new THREE.MeshStandardMaterial({ color: 0x88c0d0, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 });
  const floorMat = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), roughness: 0.9, color: 0x4a3a2a });

  // Foundation
  addMesh(scene, new THREE.BoxGeometry(7.6, 0.4, 6.6), stoneMat, x, y+0.2, z);

  // Interior Floor
  addMesh(scene, new THREE.PlaneGeometry(7.0, 6.0), floorMat, x, y+0.41, z, [-Math.PI/2, 0, 0]);

  // Walls (Thinner and double-sided)
  addMesh(scene, new THREE.BoxGeometry(7.2, 4.2, 0.1), wallMat, x, y+2.35, z+3.0); // front
  addMesh(scene, new THREE.BoxGeometry(7.2, 4.2, 0.1), wallMat, x, y+2.35, z-3.0); // back
  addMesh(scene, new THREE.BoxGeometry(0.1, 4.2, 6.0), wallMat, x+3.6, y+2.35, z); // right
  addMesh(scene, new THREE.BoxGeometry(0.1, 4.2, 6.0), wallMat, x-3.6, y+2.35, z); // left

  // Furniture
  buildInterior(scene, x, y+0.41, z);

  // Roof
  const roofGeo = new THREE.CylinderGeometry(0, 5.4, 3.2, 4, 1);
  addMesh(scene, roofGeo, roofMat, x, y+5.7, z, [0, Math.PI/4, 0]);

  // Door
  addMesh(scene, new THREE.BoxGeometry(1.3, 2.4, 0.12), doorMat, x, y+1.2, z+3.06);

  // Windows
  [[-2.4, 3.06], [2.4, 3.06]].forEach(([wx, wz]) => {
    addMesh(scene, new THREE.BoxGeometry(1.3, 1.1, 0.08), winMat, x+wx, y+2.6, z+wz);
  });
}

function buildInterior(scene, x, y, z) {
  const woodMat = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0x6b4226 });
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x3d4a30 });
  const pillowMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });

  // Bed
  addMesh(scene, new THREE.BoxGeometry(1.4, 0.4, 2.2), woodMat, x-2.5, y+0.2, z-1.5);
  addMesh(scene, new THREE.BoxGeometry(1.3, 0.2, 2.0), bedMat, x-2.5, y+0.5, z-1.5);
  addMesh(scene, new THREE.BoxGeometry(0.8, 0.15, 0.4), pillowMat, x-2.5, y+0.6, z-2.2);

  // Table
  addMesh(scene, new THREE.BoxGeometry(1.2, 0.08, 1.2), woodMat, x+2.2, y+0.9, z-1.0);
  [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(([dx, dz]) => {
    addMesh(scene, new THREE.BoxGeometry(0.1, 0.9, 0.1), woodMat, x+2.2+dx, y+0.45, z-1.0+dz);
  });

  // ── Refrigerator (right side, back wall area) ─────────────────
  const fridgeBodyMat  = new THREE.MeshStandardMaterial({ color: 0xdde0e2, roughness: 0.55, metalness: 0.15 });
  const fridgeDoorMat  = new THREE.MeshStandardMaterial({ color: 0xcdd0d2, roughness: 0.45, metalness: 0.2 });
  const fridgeDivMat   = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.4, metalness: 0.5 });
  const handleMat      = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.25, metalness: 0.85 });

  // Body
  addMesh(scene, new THREE.BoxGeometry(0.68, 1.45, 0.58), fridgeBodyMat, x+2.8, y+0.725, z-2.0);
  // Front door panel (slightly proud of body)
  addMesh(scene, new THREE.BoxGeometry(0.62, 1.40, 0.03), fridgeDoorMat, x+2.8, y+0.725, z-2.0+0.305);
  // Freezer divider line (upper third)
  addMesh(scene, new THREE.BoxGeometry(0.62, 0.025, 0.04), fridgeDivMat, x+2.8, y+1.15, z-2.0+0.305);
  // Main door handle (lower section)
  addMesh(scene, new THREE.BoxGeometry(0.035, 0.38, 0.035), handleMat, x+2.8-0.26, y+0.62, z-2.0+0.325);
  // Freezer door handle (upper section)
  addMesh(scene, new THREE.BoxGeometry(0.035, 0.16, 0.035), handleMat, x+2.8-0.26, y+1.28, z-2.0+0.325);
}


function buildMotorcycle(scene, x, y, z) {
  const blackMat   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.4 });
  const chromeMat  = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.08, metalness: 0.95 });
  const redMat     = new THREE.MeshStandardMaterial({ color: 0xbb2200, roughness: 0.3, metalness: 0.2 });
  const seatMat    = new THREE.MeshStandardMaterial({ color: 0x1a1212, roughness: 0.95 });
  const engineMat  = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.45, metalness: 0.65 });
  const rubberMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
  const rimMat     = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.2, metalness: 0.85 });
  const glowMat    = new THREE.MeshStandardMaterial({ color: 0xffffcc, roughness: 0.1, emissive: 0xffffaa, emissiveIntensity: 0.3 });
  const tailMat    = new THREE.MeshStandardMaterial({ color: 0xff2200, roughness: 0.3, emissive: 0xff1100, emissiveIntensity: 0.15 });

  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = -Math.PI / 5;
  scene.add(group);

  // ── Wheels ────────────────────────────────────────────────────
  const wheelGeo = new THREE.TorusGeometry(0.38, 0.085, 12, 30);
  const spokeGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.76, 4);

  [{ z: -0.72 }, { z: 0.75 }].forEach(({ z: wz }) => {
    const wGrp = new THREE.Group();
    wGrp.position.set(0, 0.38, wz);
    wGrp.rotation.x = Math.PI / 2;
    wGrp.add(new THREE.Mesh(wheelGeo, rubberMat));
    // Rim inner ring
    wGrp.add(Object.assign(new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.015, 6, 24), rimMat)));
    // Spokes
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Mesh(spokeGeo, rimMat);
      sp.rotation.z = (i / 10) * Math.PI;
      wGrp.add(sp);
    }
    // Hub
    wGrp.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 8), rimMat)));
    group.add(wGrp);
  });

  // ── Frame ─────────────────────────────────────────────────────
  // Top spine (backbone tube, slightly angled)
  const spineGeo = new THREE.CylinderGeometry(0.024, 0.024, 1.42, 7);
  const spine = new THREE.Mesh(spineGeo, chromeMat);
  spine.rotation.x = Math.PI / 2;
  spine.position.set(0, 0.88, 0.01);
  group.add(spine);

  // Down tube (head to engine)
  const dtGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.88, 6);
  const dt = new THREE.Mesh(dtGeo, chromeMat);
  dt.rotation.x = Math.PI * 0.58;
  dt.position.set(0, 0.64, 0.44);
  group.add(dt);

  // Seat tube (vertical under seat)
  const stGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.50, 6);
  const st = new THREE.Mesh(stGeo, chromeMat);
  st.position.set(0, 0.63, -0.20);
  group.add(st);

  // Chainstays (rear)
  [-0.09, 0.09].forEach(ox => {
    const cs = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.82, 6), chromeMat);
    cs.rotation.x = Math.PI * 0.54;
    cs.position.set(ox, 0.41, -0.30);
    group.add(cs);
  });

  // Swingarm
  [-0.06, 0.06].forEach(ox => {
    const sa = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.74, 6), chromeMat);
    sa.rotation.x = Math.PI / 2;
    sa.position.set(ox, 0.38, -0.35);
    group.add(sa);
  });

  // ── Engine Block ───────────────────────────────────────────────
  const eng = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.34, 0.38), engineMat);
  eng.position.set(0, 0.54, 0.10);
  group.add(eng);
  // Cylinder head (fins)
  const cyh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.22), engineMat);
  cyh.position.set(0, 0.74, 0.09);
  group.add(cyh);
  // Cooling fins
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.012, 0.24), engineMat);
    fin.position.set(0, 0.66 + i * 0.022, 0.09);
    group.add(fin);
  }
  // Crankcase
  const cc = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.32), engineMat);
  cc.position.set(0, 0.37, 0.10);
  group.add(cc);

  // ── Fuel Tank ─────────────────────────────────────────────────
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.48, 5, 12), redMat);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0, 0.96, 0.10);
  group.add(tank);
  // Tank cap
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 8), chromeMat);
  cap.position.set(0, 1.09, 0.04);
  group.add(cap);

  // ── Seat ──────────────────────────────────────────────────────
  const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.52, 4, 8), seatMat);
  seat.rotation.x = Math.PI / 2;
  seat.position.set(0, 0.985, -0.32);
  group.add(seat);

  // ── Front Fork ────────────────────────────────────────────────
  [-0.085, 0.085].forEach(ox => {
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.016, 0.60, 7), chromeMat);
    fork.rotation.x = Math.PI * 0.13;
    fork.position.set(ox, 0.66, 0.66);
    group.add(fork);
    // Lower fork leg (slightly wider)
    const forkLow = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.25, 7), chromeMat);
    forkLow.rotation.x = Math.PI * 0.13;
    forkLow.position.set(ox, 0.42, 0.73);
    group.add(forkLow);
  });
  // Fork bridge
  const fb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.05), chromeMat);
  fb.position.set(0, 0.82, 0.66);
  group.add(fb);

  // ── Handlebars ────────────────────────────────────────────────
  const hbar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.58, 6), chromeMat);
  hbar.rotation.z = Math.PI / 2;
  hbar.position.set(0, 1.12, 0.64);
  group.add(hbar);
  // Risers
  [-0.22, 0.22].forEach(ox => {
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6), chromeMat);
    riser.position.set(ox, 1.065, 0.64);
    group.add(riser);
    // Grip rubber
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 8), blackMat);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(ox, 1.12, 0.64);
    group.add(grip);
  });
  // Brake lever
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.10), chromeMat);
  lever.rotation.y = -0.4;
  lever.position.set(-0.26, 1.11, 0.70);
  group.add(lever);

  // ── Exhaust ───────────────────────────────────────────────────
  // Header pipe
  const hdr = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 8), chromeMat);
  hdr.rotation.x = Math.PI / 2;
  hdr.position.set(-0.16, 0.44, -0.12);
  group.add(hdr);
  // Mid pipe (angled)
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8), chromeMat);
  mid.rotation.x = Math.PI * 0.6;
  mid.position.set(-0.16, 0.35, -0.50);
  group.add(mid);
  // Muffler
  const muf = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.38, 10), chromeMat);
  muf.rotation.x = Math.PI / 2;
  muf.position.set(-0.16, 0.40, -0.75);
  group.add(muf);
  // End cap
  const end = new THREE.Mesh(new THREE.CircleGeometry(0.032, 10), blackMat);
  end.rotation.y = Math.PI / 2;
  end.position.set(-0.16, 0.40, -0.95);
  group.add(end);

  // ── Headlight ─────────────────────────────────────────────────
  const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.055, 12), glowMat);
  hl.rotation.x = Math.PI / 2;
  hl.position.set(0, 0.86, 0.84);
  group.add(hl);
  // Headlight rim
  const hlr = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12), chromeMat);
  hlr.rotation.x = Math.PI / 2;
  hlr.position.set(0, 0.86, 0.84);
  group.add(hlr);

  // ── Tail Light ────────────────────────────────────────────────
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.04, 0.03), tailMat);
  tl.position.set(0, 0.99, -0.93);
  group.add(tl);

  // ── Shadows ───────────────────────────────────────────────────
  group.traverse(obj => {
    if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; }
  });
}


function buildAxeArea(scene, x, y, z) {
  const woodMat = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0x553311 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
  
  // Stump
  addMesh(scene, new THREE.CylinderGeometry(0.4, 0.45, 0.6, 8), woodMat, x, y+0.3, z);
  // Axe
  addMesh(scene, new THREE.BoxGeometry(0.06, 0.8, 0.06), woodMat, x, y+0.7, z, [0.4, 0, 0]);
  addMesh(scene, new THREE.BoxGeometry(0.08, 0.2, 0.3), ironMat, x, y+1.0, z+0.1, [0.4, 0, 0]);
}

function buildFarm(scene) {
  const soilMat = new THREE.MeshStandardMaterial({ map: makeDirtTexture(), roughness: 0.95 });
  const crops = [
    { x:-8, z:6, rows:3, cols:4, ripe:false },
    { x:-2, z:8, rows:3, cols:4, ripe:true  },
    { x: 4, z:8, rows:2, cols:3, ripe:false }
  ];
  crops.forEach(({x, z, rows, cols, ripe}) => {
    addMesh(scene, new THREE.BoxGeometry(cols*1.2+0.4, 0.22, rows*1.2+0.4),
      soilMat, x+cols*0.6, 0.11, z+rows*0.6);
    const cMat = new THREE.MeshStandardMaterial({
      color: ripe ? 0xe8c84a : 0x2ea84a, roughness: 0.8
    });
    for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) {
      const cx = x+c*1.2+0.6, cz = z+r*1.2+0.6;
      addMesh(scene, new THREE.CylinderGeometry(0.05,0.07,0.6,6), cMat, cx, 0.52, cz);
      addMesh(scene, new THREE.SphereGeometry(0.19,6,5), cMat, cx, 0.9, cz);
    }
  });
}

function buildTrees(scene) {
  [[-12,0,-5],[-14,0,2],[-11,0,8],[12,0,-8],[14,0,0],[13,0,7],[-6,0,-14],[6,0,-14],[0,0,-16]]
    .forEach(([x,y,z]) => buildTree(scene, x, y, z));
}

function buildTree(scene, x, y, z) {
  const sc = 0.7 + Math.random()*0.6;
  const trunkMat = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0x553311 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6a2f, roughness: 0.95 });
  addMesh(scene, new THREE.CylinderGeometry(0.17*sc, 0.28*sc, 1.9*sc, 8), trunkMat, x, y+0.95*sc, z);
  [[0,2.5,0,1.7],[0.15,3.4,0.1,1.3],[-0.1,4.2,-0.1,0.9]].forEach(([dx,hy,dz,r]) => {
    addMesh(scene, new THREE.ConeGeometry(r*sc, 1.6*sc, 8), leafMat, x+dx, y+hy*sc, z+dz);
  });
}

function buildWell(scene, x, y, z) {
  const sMat = new THREE.MeshStandardMaterial({ map: makeStoneTexture(), roughness: 0.95 });
  const wMat = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0x6b4226 });
  const waMat = new THREE.MeshStandardMaterial({ color: 0x2255aa, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.7 });
  addMesh(scene, new THREE.CylinderGeometry(0.9, 1.0, 0.85, 12, 1, true), sMat, x, y+0.42, z);
  addMesh(scene, new THREE.TorusGeometry(0.95, 0.08, 6, 12), sMat, x, y+0.85, z, [Math.PI/2,0,0]);
  const wg = new THREE.Mesh(new THREE.CircleGeometry(0.8,12), waMat);
  wg.rotation.x = -Math.PI/2; wg.position.set(x,y+0.3,z); scene.add(wg);
  [-0.7,0.7].forEach(dx => addMesh(scene, new THREE.CylinderGeometry(0.07,0.08,1.6,7), wMat, x+dx, y+1.2, z));
  addMesh(scene, new THREE.BoxGeometry(1.6, 0.14, 0.14), wMat, x, y+1.95, z);
}

function buildFence(scene) {
  const fMat = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0x775533 });
  [ {axis:'x', from:-10, to:10, z:12}, {axis:'x', from:-10, to:10, z:-14}, {axis:'z', from:-14, to:12, x:-10}, {axis:'z', from:-14, to:12, x:10} ].forEach(({axis,from,to,x,z}) => {
    for (let p=from; p<=to; p+=3) {
      const px = axis==='x'?p:x, pz = axis==='z'?p:z;
      addMesh(scene, new THREE.BoxGeometry(0.14, 1.05, 0.14), fMat, px, 0.52, pz);
      if (p+3<=to) {
        if (axis==='x') {
          addMesh(scene, new THREE.BoxGeometry(3,0.1,0.1), fMat, px+1.5, 0.65, pz);
          addMesh(scene, new THREE.BoxGeometry(3,0.1,0.1), fMat, px+1.5, 0.35, pz);
        } else {
          addMesh(scene, new THREE.BoxGeometry(0.1,0.1,3), fMat, px, 0.65, pz+1.5);
          addMesh(scene, new THREE.BoxGeometry(0.1,0.1,3), fMat, px, 0.35, pz+1.5);
        }
      }
    }
  });
}

function buildHaystacks(scene) {
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xd4a843, roughness: 0.95 });
  [[-4,0,6],[-5.5,0,5.2]].forEach(([x,y,z]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.8,8,6), hayMat);
    m.scale.y = 0.65; m.position.set(x, y+0.52, z);
    m.castShadow = true; scene.add(m);
  });
}

function buildStarField(scene) {
  const geo = new THREE.BufferGeometry();
  const verts = [];
  for (let i=0; i<2000; i++) {
    const theta = Math.random()*Math.PI*2;
    const phi = Math.acos(2*Math.random()-1);
    const r = 80 + Math.random()*20;
    verts.push(r*Math.sin(phi)*Math.cos(theta), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(theta));
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({color:0xffffff,size:0.3,sizeAttenuation:true}));
  stars.userData.isStars = true;
  scene.add(stars);
}

function addMesh(scene, geo, mat, x, y, z, rot=[0,0,0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x,y,z);
  if (rot[0]||rot[1]||rot[2]) m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  return m;
}
