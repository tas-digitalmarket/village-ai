import * as THREE from 'three';

const woodMat = new THREE.MeshStandardMaterial({ color: 0x765237, roughness: 0.92 });
const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x3d281b, roughness: 0.94 });
const clothMat = new THREE.MeshStandardMaterial({ color: 0xb9859b, roughness: 0.96 });
const pillowMat = new THREE.MeshStandardMaterial({ color: 0xf1eadf, roughness: 0.9 });
const herbMat = new THREE.MeshStandardMaterial({ color: 0x6fa75d, roughness: 0.98 });
const jarMat = new THREE.MeshStandardMaterial({ color: 0xb9d5d5, roughness: 0.35, transparent: true, opacity: 0.58 });
const rugMat = new THREE.MeshStandardMaterial({ color: 0x8d5b6c, roughness: 0.98 });
const floorMat = new THREE.MeshStandardMaterial({ color: 0x6f5136, roughness: 0.96 });

function add(scene, geometry, material, x, y, z, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addLegs(scene, x, y, z, width, depth, height) {
  const dx = width / 2 - 0.08;
  const dz = depth / 2 - 0.08;
  [[-dx, -dz], [dx, -dz], [-dx, dz], [dx, dz]].forEach(([lx, lz]) => {
    add(scene, new THREE.BoxGeometry(0.09, height, 0.09), darkWoodMat, x + lx, y + height / 2, z + lz);
  });
}

export function buildAidaHomeInterior(scene) {
  const cx = 18;
  const cz = 36;
  add(scene, new THREE.PlaneGeometry(6.6, 5.4), floorMat, cx, 0.43, cz, [-Math.PI / 2, 0, 0]);
  add(scene, new THREE.PlaneGeometry(2.8, 1.8), rugMat, cx + 0.1, 0.445, cz + 0.55, [-Math.PI / 2, 0, 0]);

  add(scene, new THREE.BoxGeometry(1.35, 0.36, 2.05), woodMat, cx - 2.25, 0.66, cz - 1.25);
  add(scene, new THREE.BoxGeometry(1.22, 0.18, 1.86), clothMat, cx - 2.25, 0.94, cz - 1.25);
  add(scene, new THREE.BoxGeometry(0.78, 0.14, 0.36), pillowMat, cx - 2.25, 1.06, cz - 1.95);

  add(scene, new THREE.BoxGeometry(1.45, 0.1, 1.05), woodMat, cx + 2.05, 1.02, cz - 0.9);
  addLegs(scene, cx + 2.05, 0.48, cz - 0.9, 1.45, 1.05, 0.9);
  add(scene, new THREE.BoxGeometry(0.42, 0.28, 0.34), jarMat, cx + 1.65, 1.22, cz - 0.95);
  add(scene, new THREE.CylinderGeometry(0.18, 0.2, 0.28, 10), jarMat, cx + 2.18, 1.21, cz - 0.72);

  add(scene, new THREE.BoxGeometry(1.85, 0.1, 0.72), woodMat, cx + 2.1, 1.0, cz + 1.7);
  addLegs(scene, cx + 2.1, 0.48, cz + 1.7, 1.85, 0.72, 0.86);
  for (let i = 0; i < 5; i += 1) {
    add(scene, new THREE.CylinderGeometry(0.035, 0.045, 0.44, 6), herbMat, cx + 1.42 + i * 0.28, 1.28, cz + 1.65);
    add(scene, new THREE.SphereGeometry(0.12, 6, 5), herbMat, cx + 1.42 + i * 0.28, 1.55, cz + 1.65);
  }

  add(scene, new THREE.BoxGeometry(1.5, 1.35, 0.28), darkWoodMat, cx - 2.75, 1.1, cz + 1.25);
  add(scene, new THREE.BoxGeometry(1.38, 0.08, 0.3), woodMat, cx - 2.75, 1.42, cz + 1.42);
  add(scene, new THREE.BoxGeometry(1.38, 0.08, 0.3), woodMat, cx - 2.75, 0.95, cz + 1.42);
}
