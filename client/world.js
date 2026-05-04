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
}

function buildMotorcycle(scene, x, y, z) {
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.5 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.1, metalness: 0.9 });

  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = -Math.PI / 3;
  scene.add(group);

  // Wheels
  const wheelGeo = new THREE.TorusGeometry(0.35, 0.1, 8, 20);
  const w1 = new THREE.Mesh(wheelGeo, blackMat); w1.position.set(0, 0.35, 0.7); group.add(w1);
  const w2 = new THREE.Mesh(wheelGeo, blackMat); w2.position.set(0, 0.35, -0.7); group.add(w2);
  
  // Frame + Tank
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 1.2), blackMat);
  body.position.set(0, 0.55, 0); group.add(body);
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.4, 4, 8), blackMat);
  tank.rotation.x = Math.PI/2; tank.position.set(0, 0.85, 0.1); group.add(tank);
  
  // Handlebars
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), chromeMat);
  bar.rotation.z = Math.PI/2; bar.position.set(0, 1.05, 0.5); group.add(bar);
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
