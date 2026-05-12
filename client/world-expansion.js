// world-expansion.js - Larger village layout layered on top of the farm scene.
import * as THREE from 'three';

const grassMat = new THREE.MeshStandardMaterial({ color: 0x496f31, roughness: 0.98 });
const dirtMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.96 });
const pathMat = new THREE.MeshStandardMaterial({ color: 0x8a6542, roughness: 0.96 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x6f4726, roughness: 0.92 });
const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x4f321c, roughness: 0.94 });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8b877f, roughness: 0.98 });
const plasterMat = new THREE.MeshStandardMaterial({ color: 0xd8cfbc, roughness: 0.95 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x70412d, roughness: 0.92 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6a35, roughness: 0.98 });
const leafAltMat = new THREE.MeshStandardMaterial({ color: 0x3c7a46, roughness: 0.98 });
const waterMat = new THREE.MeshStandardMaterial({ color: 0x3a83b8, roughness: 0.18, metalness: 0.08, transparent: true, opacity: 0.82 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xb89142, roughness: 0.72, metalness: 0.12 });

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

export function buildWorldExpansion(scene) {
  buildFarmSupportZone(scene);
  buildVillageRoad(scene);
  buildVillageCenter(scene);
  buildNatureZone(scene);
  buildNarrativeFrontier(scene);
  buildFuturePass(scene);
}

function buildFarmSupportZone(scene) {
  buildStorehouse(scene, -12, 0, -7);
  buildBarn(scene, 11, 0, 8);
  buildPens(scene, 13, 0, 11);
}

function buildStorehouse(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(4.8, 0.35, 4.2), stoneMat, x, y + 0.18, z);
  addMesh(scene, new THREE.BoxGeometry(4.4, 2.8, 3.8), plasterMat, x, y + 1.6, z);
  addMesh(scene, new THREE.ConeGeometry(3.7, 2.0, 4), roofMat, x, y + 4.0, z, [0, Math.PI / 4, 0]);
  addMesh(scene, new THREE.BoxGeometry(1.0, 1.8, 0.08), darkWoodMat, x, y + 0.95, z + 1.94);
  addMesh(scene, new THREE.BoxGeometry(1.0, 0.08, 2.6), woodMat, x - 1.3, y + 0.55, z + 2.6);
  addMesh(scene, new THREE.CylinderGeometry(0.52, 0.58, 1.0, 12), woodMat, x + 1.4, y + 0.5, z + 2.5);
  addMesh(scene, new THREE.CylinderGeometry(0.48, 0.54, 0.9, 12), woodMat, x + 2.1, y + 0.45, z + 2.2);
}

function buildBarn(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(6.4, 0.38, 5.4), stoneMat, x, y + 0.19, z);
  addMesh(scene, new THREE.BoxGeometry(6.0, 3.3, 5.0), new THREE.MeshStandardMaterial({ color: 0x8d5138, roughness: 0.94 }), x, y + 1.85, z);
  addMesh(scene, new THREE.ConeGeometry(4.5, 2.35, 4), roofMat, x, y + 4.65, z, [0, Math.PI / 4, 0]);
  addMesh(scene, new THREE.BoxGeometry(1.5, 2.45, 0.1), darkWoodMat, x, y + 1.24, z + 2.56);
  addMesh(scene, new THREE.BoxGeometry(0.95, 0.95, 0.08), new THREE.MeshStandardMaterial({ color: 0x9bc2d6, transparent: true, opacity: 0.55 }), x - 1.8, y + 2.15, z + 2.58);
  addMesh(scene, new THREE.BoxGeometry(0.95, 0.95, 0.08), new THREE.MeshStandardMaterial({ color: 0x9bc2d6, transparent: true, opacity: 0.55 }), x + 1.8, y + 2.15, z + 2.58);
}

function buildPens(scene, x, y, z) {
  const posts = [
    [-3, -2], [0, -2], [3, -2],
    [-3, 2], [0, 2], [3, 2]
  ];
  posts.forEach(([dx, dz]) => addMesh(scene, new THREE.BoxGeometry(0.14, 1.1, 0.14), woodMat, x + dx, y + 0.55, z + dz));
  [-2, 2].forEach(dz => addMesh(scene, new THREE.BoxGeometry(6.1, 0.1, 0.12), woodMat, x, y + 0.75, z + dz));
  [-2, 2].forEach(dz => addMesh(scene, new THREE.BoxGeometry(6.1, 0.1, 0.12), woodMat, x, y + 0.42, z + dz));
  [-3, 3].forEach(dx => addMesh(scene, new THREE.BoxGeometry(0.12, 0.1, 4.1), woodMat, x + dx, y + 0.75, z));
  [-3, 3].forEach(dx => addMesh(scene, new THREE.BoxGeometry(0.12, 0.1, 4.1), woodMat, x + dx, y + 0.42, z));
  addMesh(scene, new THREE.BoxGeometry(1.1, 0.5, 0.7), goldMat, x - 1.6, y + 0.25, z);
  addMesh(scene, new THREE.BoxGeometry(1.1, 0.5, 0.7), goldMat, x + 1.6, y + 0.25, z + 0.55);
}

function buildVillageRoad(scene) {
  addRoad(scene, 0, 0.018, 10, 2.7, 24, 0);
  addRoad(scene, 12, 0.018, 22, 24, 2.7, Math.PI / 2);
  addRoad(scene, 24, 0.018, 22, 2.7, 12, 0);
  addRoad(scene, 26.2, 0.018, 27, 16, 2.4, Math.PI / 2);
}

function addRoad(scene, x, y, z, width, length, rotationY) {
  addMesh(scene, new THREE.PlaneGeometry(width, length), pathMat, x, y, z, [-Math.PI / 2, rotationY, 0]);
}

function buildVillageCenter(scene) {
  buildSquare(scene, 26, 0, 22);
  buildMarketStall(scene, 22, 0, 20);
  buildPrayerHouse(scene, 30.5, 0, 18.5);
  buildFutureHouse(scene, 20, 0, 28, 0xcebda5);
  buildFutureHouse(scene, 28.5, 0, 31, 0xd8cab5);
  buildFutureHouse(scene, 35, 0, 24, 0xcbb296);
}

function buildSquare(scene, x, y, z) {
  addMesh(scene, new THREE.CircleGeometry(6.2, 32), dirtMat, x, y + 0.02, z, [-Math.PI / 2, 0, 0]);
  addMesh(scene, new THREE.CylinderGeometry(0.65, 0.8, 0.7, 12), stoneMat, x, y + 0.35, z);
  addMesh(scene, new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshStandardMaterial({ color: 0x6d8d4f, roughness: 0.96 }), x, y + 1.1, z);
  [[-4.4, 0], [4.4, 0], [0, -4.4], [0, 4.4]].forEach(([dx, dz]) => {
    addMesh(scene, new THREE.BoxGeometry(1.6, 0.18, 0.45), woodMat, x + dx, y + 0.48, z + dz, [0, Math.abs(dx) > 0 ? 0 : Math.PI / 2, 0]);
    addMesh(scene, new THREE.BoxGeometry(0.12, 0.55, 0.12), woodMat, x + dx - (Math.abs(dx) > 0 ? 0.55 : 0), y + 0.27, z + dz - (Math.abs(dx) > 0 ? 0 : 0.55));
    addMesh(scene, new THREE.BoxGeometry(0.12, 0.55, 0.12), woodMat, x + dx + (Math.abs(dx) > 0 ? 0.55 : 0), y + 0.27, z + dz + (Math.abs(dx) > 0 ? 0 : 0.55));
  });
}

function buildMarketStall(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(4.0, 0.18, 2.2), woodMat, x, y + 0.9, z);
  [-1.7, 1.7].forEach(dx => [-0.8, 0.8].forEach(dz => addMesh(scene, new THREE.BoxGeometry(0.14, 2.4, 0.14), darkWoodMat, x + dx, y + 1.2, z + dz)));
  addMesh(scene, new THREE.BoxGeometry(4.4, 0.18, 2.6), new THREE.MeshStandardMaterial({ color: 0x9e5c3f, roughness: 0.92 }), x, y + 2.45, z);
  [-1.0, 0, 1.0].forEach(dx => addMesh(scene, new THREE.BoxGeometry(0.75, 0.42, 0.75), goldMat, x + dx, y + 1.2, z));
}

function buildPrayerHouse(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(5.0, 0.34, 4.6), stoneMat, x, y + 0.17, z);
  addMesh(scene, new THREE.BoxGeometry(4.7, 3.2, 4.2), plasterMat, x, y + 1.75, z);
  addMesh(scene, new THREE.ConeGeometry(3.5, 1.8, 4), roofMat, x, y + 4.25, z, [0, Math.PI / 4, 0]);
  addMesh(scene, new THREE.CylinderGeometry(0.42, 0.48, 4.8, 12), stoneMat, x + 3.1, y + 2.4, z - 1.25);
  addMesh(scene, new THREE.ConeGeometry(0.8, 1.0, 8), roofMat, x + 3.1, y + 5.25, z - 1.25);
  addMesh(scene, new THREE.BoxGeometry(1.05, 1.9, 0.1), darkWoodMat, x, y + 1.0, z + 2.16);
}

function buildFutureHouse(scene, x, y, z, color) {
  const wall = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  addMesh(scene, new THREE.BoxGeometry(4.8, 0.28, 4.2), stoneMat, x, y + 0.14, z);
  addMesh(scene, new THREE.BoxGeometry(4.4, 2.85, 3.8), wall, x, y + 1.58, z);
  addMesh(scene, new THREE.ConeGeometry(3.5, 1.8, 4), roofMat, x, y + 3.95, z, [0, Math.PI / 4, 0]);
  addMesh(scene, new THREE.BoxGeometry(0.92, 1.72, 0.08), darkWoodMat, x, y + 0.92, z + 1.94);
  addMesh(scene, new THREE.BoxGeometry(0.9, 0.85, 0.08), new THREE.MeshStandardMaterial({ color: 0x9ec3d0, transparent: true, opacity: 0.48 }), x - 1.35, y + 1.95, z + 1.96);
  addMesh(scene, new THREE.BoxGeometry(0.9, 0.85, 0.08), new THREE.MeshStandardMaterial({ color: 0x9ec3d0, transparent: true, opacity: 0.48 }), x + 1.35, y + 1.95, z + 1.96);
}

function buildNatureZone(scene) {
  buildRiver(scene);
  buildBridge(scene, 8, 0, -17);
  buildForestEntrance(scene, -18, 0, 5);
  buildSparseForest(scene);
  buildWalkingTrail(scene);
  buildFishingSpot(scene, 12, 0, -24);
  buildGatheringPatches(scene);
}

function buildRiver(scene) {
  addMesh(scene, new THREE.PlaneGeometry(8.5, 58), waterMat, 12, 0.015, -14, [-Math.PI / 2, 0.15, 0]);
  addMesh(scene, new THREE.PlaneGeometry(1.6, 58), dirtMat, 7.8, 0.02, -14, [-Math.PI / 2, 0.15, 0]);
  addMesh(scene, new THREE.PlaneGeometry(1.6, 58), dirtMat, 16.2, 0.02, -14, [-Math.PI / 2, 0.15, 0]);
}

function buildBridge(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(10.4, 0.28, 2.3), woodMat, x + 4, y + 0.32, z, [0, 0.15, 0]);
  [-4.5, 4.5].forEach(dx => addMesh(scene, new THREE.BoxGeometry(0.18, 0.92, 0.18), darkWoodMat, x + 4 + dx, y + 0.86, z));
  addMesh(scene, new THREE.BoxGeometry(10.1, 0.12, 0.14), darkWoodMat, x + 4, y + 1.18, z - 0.92, [0, 0.15, 0]);
  addMesh(scene, new THREE.BoxGeometry(10.1, 0.12, 0.14), darkWoodMat, x + 4, y + 1.18, z + 0.92, [0, 0.15, 0]);
}

function buildForestEntrance(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(0.25, 2.6, 0.25), darkWoodMat, x - 1.6, y + 1.3, z);
  addMesh(scene, new THREE.BoxGeometry(0.25, 2.6, 0.25), darkWoodMat, x + 1.6, y + 1.3, z);
  addMesh(scene, new THREE.BoxGeometry(3.55, 0.24, 0.24), darkWoodMat, x, y + 2.55, z);
  addMesh(scene, new THREE.BoxGeometry(2.4, 0.18, 0.18), woodMat, x, y + 2.92, z);
}

function buildSparseForest(scene) {
  const trees = [
    [-25, -1], [-30, 4], [-27, 11], [-21, 14], [-18, 18], [-13, 16],
    [-24, 23], [-31, 22], [-35, 12], [-38, 18], [-34, 28], [-26, 31],
    [-16, 27], [-10, 23], [-8, 16]
  ];
  trees.forEach(([x, z], idx) => buildTree(scene, x, 0, z, 0.85 + (idx % 4) * 0.12, idx % 2 === 0 ? leafMat : leafAltMat));
}

function buildTree(scene, x, y, z, scale, foliageMaterial) {
  addMesh(scene, new THREE.CylinderGeometry(0.18 * scale, 0.26 * scale, 2.3 * scale, 8), woodMat, x, y + 1.15 * scale, z);
  addMesh(scene, new THREE.ConeGeometry(1.65 * scale, 1.9 * scale, 9), foliageMaterial, x, y + 2.85 * scale, z);
  addMesh(scene, new THREE.ConeGeometry(1.3 * scale, 1.55 * scale, 9), foliageMaterial, x, y + 3.95 * scale, z);
}

function buildWalkingTrail(scene) {
  addRoad(scene, -13.5, 0.02, 9, 2.0, 15, -0.42);
  addRoad(scene, -21, 0.02, 18, 1.8, 17, -0.08);
  addRoad(scene, -28.5, 0.02, 28, 1.7, 14, -0.28);
}

function buildFishingSpot(scene, x, y, z) {
  addMesh(scene, new THREE.CircleGeometry(2.2, 22), dirtMat, x, y + 0.025, z, [-Math.PI / 2, 0, 0]);
  addMesh(scene, new THREE.BoxGeometry(2.2, 0.18, 0.48), woodMat, x - 1.25, y + 0.48, z + 0.8);
  addMesh(scene, new THREE.BoxGeometry(0.12, 0.54, 0.12), darkWoodMat, x - 2.1, y + 0.27, z + 0.8);
  addMesh(scene, new THREE.BoxGeometry(0.12, 0.54, 0.12), darkWoodMat, x - 0.4, y + 0.27, z + 0.8);
  addMesh(scene, new THREE.CylinderGeometry(0.025, 0.025, 2.0, 8), darkWoodMat, x + 0.8, y + 0.98, z + 0.15, [0.2, 0, 0.9]);
}

function buildGatheringPatches(scene) {
  const herbMat = new THREE.MeshStandardMaterial({ color: 0x5fa357, roughness: 0.98 });
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x6bb0d6, roughness: 0.35, metalness: 0.18, emissive: 0x234254, emissiveIntensity: 0.12 });
  [[-22, 7], [-29, 15], [-17, 24], [-33, 25]].forEach(([x, z]) => {
    for (let i = 0; i < 4; i++) {
      addMesh(scene, new THREE.ConeGeometry(0.16, 0.42, 6), herbMat, x + (i % 2) * 0.42, 0.21, z + Math.floor(i / 2) * 0.38);
    }
  });
  [[-36, 30], [-32, 34], [-28, 36]].forEach(([x, z], i) => {
    addMesh(scene, new THREE.OctahedronGeometry(0.28 + i * 0.04), crystalMat, x, 0.3, z);
  });
}

function buildNarrativeFrontier(scene) {
  buildOldMill(scene, -37, 0, -24);
  buildRuins(scene, -29, 0, -33);
  buildLookoutHill(scene, -41, 0, -38);
  buildAbandonedHouse(scene, -18, 0, -37);
}

function buildOldMill(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(5.0, 0.34, 4.8), stoneMat, x, y + 0.17, z);
  addMesh(scene, new THREE.BoxGeometry(4.5, 3.3, 4.3), plasterMat, x, y + 1.82, z);
  addMesh(scene, new THREE.ConeGeometry(3.7, 1.9, 4), roofMat, x, y + 4.45, z, [0, Math.PI / 4, 0]);
  const wheel = makeGroup(scene, x + 2.6, y + 1.8, z - 0.2);
  addGroupMesh(wheel, new THREE.TorusGeometry(1.18, 0.1, 10, 24), darkWoodMat, 0, 0, 0, [0, Math.PI / 2, 0]);
  for (let i = 0; i < 6; i++) addGroupMesh(wheel, new THREE.BoxGeometry(0.12, 0.12, 2.15), woodMat, 0, 0, 0, [0, Math.PI / 2, i * Math.PI / 3]);
}

function buildRuins(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(6.0, 0.18, 4.6), stoneMat, x, y + 0.09, z);
  [-2.3, 0.3, 2.2].forEach(dx => addMesh(scene, new THREE.BoxGeometry(0.42, 2.1, 0.42), stoneMat, x + dx, y + 1.05, z - 1.45));
  addMesh(scene, new THREE.BoxGeometry(5.1, 0.35, 0.5), stoneMat, x, y + 2.2, z - 1.45);
  addMesh(scene, new THREE.BoxGeometry(1.5, 0.5, 0.8), stoneMat, x - 1.7, y + 0.25, z + 1.2, [0, 0.25, 0]);
  addMesh(scene, new THREE.BoxGeometry(1.2, 0.45, 0.8), stoneMat, x + 1.5, y + 0.22, z + 1.4, [0, -0.18, 0]);
}

function buildLookoutHill(scene, x, y, z) {
  addMesh(scene, new THREE.CylinderGeometry(6.5, 8.0, 2.6, 24), grassMat, x, y + 1.3, z);
  addMesh(scene, new THREE.CylinderGeometry(0.18, 0.22, 3.2, 10), darkWoodMat, x, y + 4.2, z);
  addMesh(scene, new THREE.BoxGeometry(3.2, 0.22, 3.2), woodMat, x, y + 3.05, z);
  [-1.35, 1.35].forEach(dx => [-1.35, 1.35].forEach(dz => addMesh(scene, new THREE.BoxGeometry(0.14, 1.25, 0.14), darkWoodMat, x + dx, y + 3.7, z + dz)));
}

function buildAbandonedHouse(scene, x, y, z) {
  addMesh(scene, new THREE.BoxGeometry(4.9, 0.24, 4.2), stoneMat, x, y + 0.12, z);
  addMesh(scene, new THREE.BoxGeometry(4.5, 2.6, 3.8), new THREE.MeshStandardMaterial({ color: 0xa99b8b, roughness: 0.98 }), x, y + 1.42, z);
  addMesh(scene, new THREE.ConeGeometry(3.55, 1.7, 4), new THREE.MeshStandardMaterial({ color: 0x5a4034, roughness: 0.98 }), x, y + 3.6, z, [0, Math.PI / 4, 0]);
  addMesh(scene, new THREE.BoxGeometry(1.0, 1.72, 0.08), darkWoodMat, x + 0.28, y + 0.9, z + 1.94, [0, 0.08, 0]);
  addMesh(scene, new THREE.BoxGeometry(0.95, 0.85, 0.08), new THREE.MeshStandardMaterial({ color: 0x6f8791, transparent: true, opacity: 0.36 }), x - 1.2, y + 1.85, z + 1.96, [0, -0.14, 0]);
}

function buildFuturePass(scene) {
  addMesh(scene, new THREE.PlaneGeometry(3.0, 22), pathMat, 35, 0.018, 39, [-Math.PI / 2, 0.08, 0]);
  [[31, 43], [35, 45], [39, 42], [42, 46]].forEach(([x, z], i) => {
    addMesh(scene, new THREE.DodecahedronGeometry(1.0 + i * 0.14), stoneMat, x, 0.9, z);
  });
  addMesh(scene, new THREE.BoxGeometry(0.28, 2.8, 0.28), darkWoodMat, 31.5, 1.4, 36);
  addMesh(scene, new THREE.BoxGeometry(0.28, 2.8, 0.28), darkWoodMat, 38.5, 1.4, 36);
  addMesh(scene, new THREE.BoxGeometry(7.4, 0.26, 0.26), darkWoodMat, 35, 2.78, 36);
}
