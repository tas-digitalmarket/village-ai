// world-expansion.js - Natural village districts layered on top of the core farm.
import * as THREE from 'three';

const grassMat = new THREE.MeshStandardMaterial({ color: 0x4f7635, roughness: 0.99 });
const meadowMat = new THREE.MeshStandardMaterial({ color: 0x5f8340, roughness: 0.99 });
const dirtMat = new THREE.MeshStandardMaterial({ color: 0x815834, roughness: 0.97 });
const trailMat = new THREE.MeshStandardMaterial({ color: 0x8a633a, roughness: 0.98 });
const riverBedMat = new THREE.MeshStandardMaterial({ color: 0x8a775b, roughness: 0.99 });
const waterMat = new THREE.MeshStandardMaterial({ color: 0x367da8, roughness: 0.2, metalness: 0.08, transparent: true, opacity: 0.86 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x74502c, roughness: 0.94 });
const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a301b, roughness: 0.96 });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8e8a80, roughness: 0.99 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0xd7ceb8, roughness: 0.96 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x75452f, roughness: 0.95 });
const foliageMats = [
  new THREE.MeshStandardMaterial({ color: 0x2f6a35, roughness: 0.99 }),
  new THREE.MeshStandardMaterial({ color: 0x3d7a42, roughness: 0.99 }),
  new THREE.MeshStandardMaterial({ color: 0x365f33, roughness: 0.99 })
];
const hayMat = new THREE.MeshStandardMaterial({ color: 0xc89b43, roughness: 0.98 });
const herbMat = new THREE.MeshStandardMaterial({ color: 0x67a85b, roughness: 0.99 });
const glowOreMat = new THREE.MeshStandardMaterial({ color: 0x6db2d6, roughness: 0.38, metalness: 0.16, emissive: 0x234253, emissiveIntensity: 0.12 });

function addMesh(scene, geometry, material, x, y, z, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function makeGroup(scene, x = 0, y = 0, z = 0) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  scene.add(group);
  return group;
}

function addGroupMesh(group, geometry, material, x, y, z, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function createRibbon(points, halfWidth, material, y = 0.018) {
  const vertices = [];
  const indices = [];
  const normals = [];
  const uvs = [];

  points.forEach((point, index) => {
    const prev = points[Math.max(index - 1, 0)];
    const next = points[Math.min(index + 1, points.length - 1)];
    const tangent = new THREE.Vector2(next.x - prev.x, next.z - prev.z).normalize();
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    const left = { x: point.x + normal.x * halfWidth, z: point.z + normal.y * halfWidth };
    const right = { x: point.x - normal.x * halfWidth, z: point.z - normal.y * halfWidth };
    vertices.push(left.x, y, left.z, right.x, y, right.z);
    normals.push(0, 1, 0, 0, 1, 0);
    const v = index / Math.max(points.length - 1, 1);
    uvs.push(0, v, 1, v);
    if (index < points.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

function addRibbon(scene, points, halfWidth, material, y = 0.018) {
  const ribbon = createRibbon(points, halfWidth, material, y);
  scene.add(ribbon);
  return ribbon;
}

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function buildWorldExpansion(scene) {
  buildFarmSupportZone(scene);
  buildVillageSpine(scene);
  buildVillageCenter(scene);
  buildRemoteRiverlands(scene);
  buildLargeForest(scene);
  buildNarrativeFrontier(scene);
  buildFuturePass(scene);
}

function buildFarmSupportZone(scene) {
  buildStorehouse(scene, -13, 0, -7);
  buildBarn(scene, 12.5, 0, 10);
  buildAnimalPen(scene, 16, 0, 12.5);
  scatterHay(scene, [[10.5, 7.1], [14.2, 7.8], [17.6, 10.6]]);
}

function buildStorehouse(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(5.2, 0.34, 4.4), stoneMat, x, y + 0.17, z);
  addMesh(scene, new THREE.BoxGeometry(4.8, 2.9, 4.0), wallMat, x, y + 1.62, z);
  addMesh(scene, new THREE.ConeGeometry(3.9, 2.1, 4), roofMat, x, y + 4.15, z, [0, Math.PI / 4, 0]);
  addMesh(scene, new THREE.BoxGeometry(1.04, 1.82, 0.08), darkWoodMat, x + 0.2, y + 0.95, z + 2.04);
  addMesh(scene, new THREE.BoxGeometry(1.35, 0.12, 2.8), woodMat, x - 1.45, y + 0.58, z + 2.7);
  addMesh(scene, new THREE.CylinderGeometry(0.54, 0.58, 1.04, 12), woodMat, x + 1.55, y + 0.52, z + 2.55);
  addMesh(scene, new THREE.CylinderGeometry(0.48, 0.52, 0.92, 12), woodMat, x + 2.26, y + 0.46, z + 2.18);
}

function buildBarn(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(6.8, 0.38, 5.7), stoneMat, x, y + 0.19, z);
  addMesh(scene, new THREE.BoxGeometry(6.35, 3.45, 5.22), new THREE.MeshStandardMaterial({ color: 0x8b5339, roughness: 0.96 }), x, y + 1.92, z);
  addMesh(scene, new THREE.ConeGeometry(4.7, 2.45, 4), roofMat, x, y + 4.85, z, [0, Math.PI / 4, 0]);
  addMesh(scene, new THREE.BoxGeometry(1.62, 2.52, 0.1), darkWoodMat, x, y + 1.28, z + 2.66);
  [-1.9, 1.9].forEach(dx => addMesh(scene, new THREE.BoxGeometry(1.02, 0.92, 0.08), new THREE.MeshStandardMaterial({ color: 0x9bc2d6, transparent: true, opacity: 0.52 }), x + dx, y + 2.24, z + 2.68));
}

function buildAnimalPen(scene, x, y, z) {
  const width = 7.2;
  const depth = 4.8;
  [-width / 2, 0, width / 2].forEach(dx => {
    [-depth / 2, depth / 2].forEach(dz => addMesh(scene, new THREE.BoxGeometry(0.14, 1.14, 0.14), woodMat, x + dx, y + 0.57, z + dz));
  });
  [-depth / 2, depth / 2].forEach(dz => {
    addMesh(scene, new THREE.BoxGeometry(width, 0.1, 0.12), woodMat, x, y + 0.78, z + dz);
    addMesh(scene, new THREE.BoxGeometry(width, 0.1, 0.12), woodMat, x, y + 0.42, z + dz);
  });
  [-width / 2, width / 2].forEach(dx => {
    addMesh(scene, new THREE.BoxGeometry(0.12, 0.1, depth), woodMat, x + dx, y + 0.78, z);
    addMesh(scene, new THREE.BoxGeometry(0.12, 0.1, depth), woodMat, x + dx, y + 0.42, z);
  });
}

function scatterHay(scene, spots) {
  spots.forEach(([x, z], idx) => {
    addMesh(scene, new THREE.SphereGeometry(0.66 + idx * 0.06, 10, 8), hayMat, x, 0.42, z, [0, 0, 0], [1.18, 0.72, 1.0]);
  });
}

function buildVillageSpine(scene) {
  const road = [
    { x: 0, z: 11 },
    { x: 7, z: 16 },
    { x: 15, z: 20 },
    { x: 24, z: 23 },
    { x: 31, z: 24 }
  ];
  addRibbon(scene, road, 1.65, trailMat, 0.022);
  addRibbon(scene, [
    { x: 24, z: 23 },
    { x: 31, z: 20 },
    { x: 37, z: 17 }
  ], 1.25, trailMat, 0.023);
}

function buildVillageCenter(scene) {
  buildSquare(scene, 31, 0, 24);
  buildMarket(scene, 24.5, 0, 21);
  buildPrayerHouse(scene, 37, 0, 18.5);
  buildFutureHouse(scene, 24, 0, 31, 0xd0c1a5);
  buildFutureHouse(scene, 34, 0, 33, 0xd9cbb8);
  buildFutureHouse(scene, 41, 0, 26, 0xcbb59d);
  scatterVillageTrees(scene);
}

function buildSquare(scene, x, y, z) {
  addMesh(scene, new THREE.CircleGeometry(7.1, 40), dirtMat, x, y + 0.024, z, [-Math.PI / 2, 0, 0]);
  addMesh(scene, new THREE.CylinderGeometry(0.68, 0.88, 0.78, 14), stoneMat, x, y + 0.39, z);
  addMesh(scene, new THREE.SphereGeometry(0.68, 14, 12), foliageMats[1], x, y + 1.2, z);
  [[-5.1, 0], [5.1, 0], [0, -5.1], [0, 5.1]].forEach(([dx, dz]) => buildBench(scene, x + dx, y, z + dz, Math.abs(dx) > 0 ? 0 : Math.PI / 2));
}

function buildBench(scene, x, y, z, rotationY) {
  addMesh(scene, new THREE.BoxGeometry(1.85, 0.18, 0.48), woodMat, x, y + 0.5, z, [0, rotationY, 0]);
  const offsets = rotationY === 0 ? [[-0.62, 0], [0.62, 0]] : [[0, -0.62], [0, 0.62]];
  offsets.forEach(([dx, dz]) => addMesh(scene, new THREE.BoxGeometry(0.12, 0.58, 0.12), darkWoodMat, x + dx, y + 0.28, z + dz));
}

function buildMarket(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(4.5, 0.18, 2.5), woodMat, x, y + 0.94, z);
  [-1.92, 1.92].forEach(dx => [-0.92, 0.92].forEach(dz => addMesh(scene, new THREE.BoxGeometry(0.14, 2.52, 0.14), darkWoodMat, x + dx, y + 1.26, z + dz)));
  addMesh(scene, new THREE.BoxGeometry(4.9, 0.2, 2.9), new THREE.MeshStandardMaterial({ color: 0xa65c3c, roughness: 0.95 }), x, y + 2.58, z);
  [-1.12, 0, 1.12].forEach(dx => addMesh(scene, new THREE.BoxGeometry(0.8, 0.44, 0.78), hayMat, x + dx, y + 1.24, z));
}

function buildPrayerHouse(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(5.4, 0.36, 4.9), stoneMat, x, y + 0.18, z);
  addMesh(scene, new THREE.BoxGeometry(5.05, 3.28, 4.48), wallMat, x, y + 1.82, z);
  addMesh(scene, new THREE.ConeGeometry(3.72, 1.92, 4), roofMat, x, y + 4.38, z, [0, Math.PI / 4, 0]);
  addMesh(scene, new THREE.CylinderGeometry(0.44, 0.5, 5.0, 14), stoneMat, x + 3.35, y + 2.52, z - 1.36);
  addMesh(scene, new THREE.ConeGeometry(0.84, 1.06, 10), roofMat, x + 3.35, y + 5.54, z - 1.36);
  addMesh(scene, new THREE.BoxGeometry(1.08, 1.94, 0.1), darkWoodMat, x, y + 1.03, z + 2.3);
}

function buildFutureHouse(scene, x, y, z, color) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.96 });
  addMesh(scene, new THREE.BoxGeometry(5.0, 0.28, 4.3), stoneMat, x, y + 0.14, z);
  addMesh(scene, new THREE.BoxGeometry(4.6, 2.92, 3.9), material, x, y + 1.62, z);
  addMesh(scene, new THREE.ConeGeometry(3.62, 1.86, 4), roofMat, x, y + 4.08, z, [0, Math.PI / 4, 0]);
  addMesh(scene, new THREE.BoxGeometry(0.95, 1.78, 0.08), darkWoodMat, x, y + 0.94, z + 1.98);
  [-1.42, 1.42].forEach(dx => addMesh(scene, new THREE.BoxGeometry(0.92, 0.84, 0.08), new THREE.MeshStandardMaterial({ color: 0x9fc5d3, transparent: true, opacity: 0.48 }), x + dx, y + 1.98, z + 2.0));
}

function scatterVillageTrees(scene) {
  [[20, 25], [28, 37], [43, 34], [45, 20], [18, 34], [40, 39]].forEach(([x, z], idx) => buildTree(scene, x, 0, z, 0.88 + idx * 0.05, foliageMats[idx % foliageMats.length]));
}

function buildRemoteRiverlands(scene) {
  const river = [
    { x: 42, z: -43 },
    { x: 39, z: -32 },
    { x: 34, z: -21 },
    { x: 31, z: -10 },
    { x: 33, z: 2 },
    { x: 38, z: 12 },
    { x: 46, z: 21 }
  ];
  addRibbon(scene, river, 4.25, riverBedMat, 0.014);
  addRibbon(scene, river, 3.15, waterMat, 0.027);
  scatterRiverRocks(scene, [[30, -12], [35, -25], [42, -35], [43, 12], [36, 5]]);
  buildBridge(scene, 35, 0, -16);
  buildFishingSpot(scene, 39, 0, -27);
}

function scatterRiverRocks(scene, spots) {
  spots.forEach(([x, z], idx) => {
    addMesh(scene, new THREE.DodecahedronGeometry(0.58 + (idx % 3) * 0.12), stoneMat, x, 0.34, z, [0.15, idx * 0.4, 0.08]);
    addMesh(scene, new THREE.DodecahedronGeometry(0.34 + (idx % 2) * 0.08), stoneMat, x + 1.2, 0.22, z - 0.8, [0.08, idx * 0.3, 0.18]);
  });
}

function buildBridge(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(9.2, 0.3, 2.34), woodMat, x, y + 0.38, z, [0, -0.18, 0]);
  [-3.9, 3.9].forEach(dx => addMesh(scene, new THREE.BoxGeometry(0.18, 0.92, 0.18), darkWoodMat, x + dx, y + 0.92, z));
  addMesh(scene, new THREE.BoxGeometry(8.9, 0.12, 0.14), darkWoodMat, x, y + 1.22, z - 0.94, [0, -0.18, 0]);
  addMesh(scene, new THREE.BoxGeometry(8.9, 0.12, 0.14), darkWoodMat, x, y + 1.22, z + 0.94, [0, -0.18, 0]);
}

function buildFishingSpot(scene, x, y, z) {
  addMesh(scene, new THREE.CircleGeometry(2.55, 28), dirtMat, x, y + 0.026, z, [-Math.PI / 2, 0, 0]);
  buildBench(scene, x - 1.3, y, z + 0.95, 0);
  addMesh(scene, new THREE.CylinderGeometry(0.028, 0.028, 2.1, 8), darkWoodMat, x + 0.92, y + 1.0, z + 0.16, [0.24, 0, 0.94]);
}

function buildLargeForest(scene) {
  buildForestEntrance(scene, -20, 0, 4.5);
  const random = rng(7619);
  for (let i = 0; i < 58; i++) {
    const x = -46 + random() * 34;
    const z = -4 + random() * 48;
    const scale = 0.8 + random() * 0.62;
    buildTree(scene, x, 0, z, scale, foliageMats[i % foliageMats.length]);
    if (i % 3 === 0) {
      buildBush(scene, x + (random() - 0.5) * 2.2, 0, z + (random() - 0.5) * 2.2, 0.52 + random() * 0.36);
    }
  }
  addRibbon(scene, [
    { x: -14, z: 7 },
    { x: -22, z: 12 },
    { x: -29, z: 19 },
    { x: -35, z: 28 },
    { x: -41, z: 38 }
  ], 1.1, trailMat, 0.024);
  buildGatheringPatches(scene);
}

function buildForestEntrance(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(0.26, 2.72, 0.26), darkWoodMat, x - 1.72, y + 1.36, z);
  addMesh(scene, new THREE.BoxGeometry(0.26, 2.72, 0.26), darkWoodMat, x + 1.72, y + 1.36, z);
  addMesh(scene, new THREE.BoxGeometry(3.76, 0.24, 0.24), darkWoodMat, x, y + 2.68, z);
  addMesh(scene, new THREE.BoxGeometry(2.48, 0.18, 0.18), woodMat, x, y + 3.0, z);
}

function buildTree(scene, x, y, z, scale, foliageMaterial) {
  addMesh(scene, new THREE.CylinderGeometry(0.18 * scale, 0.28 * scale, 2.45 * scale, 9), woodMat, x, y + 1.22 * scale, z);
  addMesh(scene, new THREE.ConeGeometry(1.72 * scale, 1.95 * scale, 9), foliageMaterial, x, y + 2.95 * scale, z);
  addMesh(scene, new THREE.ConeGeometry(1.38 * scale, 1.62 * scale, 9), foliageMaterial, x + 0.08, y + 4.06 * scale, z - 0.04);
}

function buildBush(scene, x, y, z, scale) {
  addMesh(scene, new THREE.SphereGeometry(0.72 * scale, 10, 8), meadowMat, x, y + 0.48 * scale, z, [0, 0, 0], [1.2, 0.72, 1.0]);
  addMesh(scene, new THREE.SphereGeometry(0.58 * scale, 10, 8), foliageMats[1], x + 0.46 * scale, y + 0.42 * scale, z - 0.18 * scale, [0, 0, 0], [1, 0.78, 1]);
}

function buildGatheringPatches(scene) {
  [[-24, 10], [-31, 18], [-39, 27], [-34, 36], [-18, 29]].forEach(([x, z]) => {
    for (let i = 0; i < 5; i++) {
      addMesh(scene, new THREE.ConeGeometry(0.17, 0.46, 6), herbMat, x + (i % 3) * 0.34, 0.23, z + Math.floor(i / 3) * 0.4);
    }
  });
  [[-43, 39], [-38, 42], [-31, 41]].forEach(([x, z], idx) => addMesh(scene, new THREE.OctahedronGeometry(0.3 + idx * 0.04), glowOreMat, x, 0.34, z));
}

function buildNarrativeFrontier(scene) {
  buildOldMill(scene, 45, 0, -39);
  buildRuins(scene, -29, 0, -34);
  buildLookoutHill(scene, -42, 0, -41);
  buildAbandonedHouse(scene, -18, 0, -39);
}

function buildOldMill(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(5.2, 0.34, 4.9), stoneMat, x, y + 0.17, z);
  addMesh(scene, new THREE.BoxGeometry(4.7, 3.42, 4.35), wallMat, x, y + 1.88, z);
  addMesh(scene, new THREE.ConeGeometry(3.82, 1.96, 4), roofMat, x, y + 4.58, z, [0, Math.PI / 4, 0]);
  const wheel = makeGroup(scene, x - 2.75, y + 1.9, z - 0.18);
  addGroupMesh(wheel, new THREE.TorusGeometry(1.28, 0.11, 10, 28), darkWoodMat, 0, 0, 0, [0, Math.PI / 2, 0]);
  for (let i = 0; i < 6; i++) addGroupMesh(wheel, new THREE.BoxGeometry(0.12, 0.12, 2.34), woodMat, 0, 0, 0, [0, Math.PI / 2, i * Math.PI / 3]);
}

function buildRuins(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(6.4, 0.18, 4.9), stoneMat, x, y + 0.09, z);
  [-2.45, 0.2, 2.3].forEach(dx => addMesh(scene, new THREE.BoxGeometry(0.44, 2.18, 0.44), stoneMat, x + dx, y + 1.09, z - 1.58));
  addMesh(scene, new THREE.BoxGeometry(5.35, 0.35, 0.52), stoneMat, x, y + 2.26, z - 1.58);
  addMesh(scene, new THREE.BoxGeometry(1.58, 0.54, 0.84), stoneMat, x - 1.85, y + 0.27, z + 1.34, [0, 0.28, 0]);
  addMesh(scene, new THREE.BoxGeometry(1.24, 0.48, 0.82), stoneMat, x + 1.68, y + 0.24, z + 1.48, [0, -0.2, 0]);
}

function buildLookoutHill(scene, x, y, z) {
  addMesh(scene, new THREE.CylinderGeometry(7.3, 9.0, 3.1, 28), grassMat, x, y + 1.55, z);
  addMesh(scene, new THREE.CylinderGeometry(0.18, 0.22, 3.3, 10), darkWoodMat, x, y + 4.45, z);
  addMesh(scene, new THREE.BoxGeometry(3.45, 0.24, 3.45), woodMat, x, y + 3.3, z);
  [-1.45, 1.45].forEach(dx => [-1.45, 1.45].forEach(dz => addMesh(scene, new THREE.BoxGeometry(0.14, 1.28, 0.14), darkWoodMat, x + dx, y + 3.95, z + dz)));
}

function buildAbandonedHouse(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(5.0, 0.24, 4.3), stoneMat, x, y + 0.12, z);
  addMesh(scene, new THREE.BoxGeometry(4.6, 2.72, 3.9), new THREE.MeshStandardMaterial({ color: 0xa79a88, roughness: 0.99 }), x, y + 1.48, z);
  addMesh(scene, new THREE.ConeGeometry(3.62, 1.74, 4), new THREE.MeshStandardMaterial({ color: 0x5e4335, roughness: 0.99 }), x, y + 3.72, z, [0, Math.PI / 4, 0]);
  addMesh(scene, new THREE.BoxGeometry(1.02, 1.78, 0.08), darkWoodMat, x + 0.3, y + 0.94, z + 1.98, [0, 0.08, 0]);
  addMesh(scene, new THREE.BoxGeometry(0.98, 0.88, 0.08), new THREE.MeshStandardMaterial({ color: 0x6e8792, transparent: true, opacity: 0.34 }), x - 1.24, y + 1.92, z + 2.0, [0, -0.14, 0]);
}

function buildFuturePass(scene) {
  addRibbon(scene, [
    { x: 38, z: 35 },
    { x: 42, z: 40 },
    { x: 47, z: 47 }
  ], 1.34, trailMat, 0.024);
  [[40, 42], [45, 47], [49, 44]].forEach(([x, z], idx) => addMesh(scene, new THREE.DodecahedronGeometry(0.92 + idx * 0.16), stoneMat, x, 0.88, z));
  addMesh(scene, new THREE.BoxGeometry(0.28, 2.9, 0.28), darkWoodMat, 39.5, 1.45, 36.8);
  addMesh(scene, new THREE.BoxGeometry(0.28, 2.9, 0.28), darkWoodMat, 45.8, 1.45, 36.8);
  addMesh(scene, new THREE.BoxGeometry(6.8, 0.26, 0.26), darkWoodMat, 42.65, 2.86, 36.8);
}
