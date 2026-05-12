// ida-character.js - Lightweight second villager with smooth movement.
import * as THREE from 'three';

export class AidaCharacter {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.currentPos = new THREE.Vector3(18, 0, 36);
    this.targetPos = new THREE.Vector3(18, 0, 36);
    this.moveSpeed = 1.6;
    this.animTime = 0;
    this.parts = {};
    this.root.position.copy(this.currentPos);
    this._build();
  }

  _mesh(geo, mat, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _build() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89263, roughness: 0.82 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x3a2f2c, roughness: 0.96 });
    const dress = new THREE.MeshStandardMaterial({ color: 0x5c7c63, roughness: 0.94 });
    const dressDark = new THREE.MeshStandardMaterial({ color: 0x44604c, roughness: 0.94 });
    const boots = new THREE.MeshStandardMaterial({ color: 0x352318, roughness: 0.92 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xd8c9b0, roughness: 0.96 });

    const hips = new THREE.Group();
    hips.position.set(0, 0.72, 0);
    this.root.add(hips);
    this.parts.hips = hips;

    hips.add(this._mesh(new THREE.BoxGeometry(0.36, 0.2, 0.24), dressDark));

    const torso = new THREE.Group();
    torso.position.set(0, 0.34, 0);
    hips.add(torso);
    this.parts.torso = torso;
    torso.add(this._mesh(new THREE.CapsuleGeometry(0.18, 0.46, 4, 8), dress));

    const head = new THREE.Group();
    head.position.set(0, 0.42, 0);
    torso.add(head);
    this.parts.head = head;
    head.add(this._mesh(new THREE.SphereGeometry(0.17, 10, 8), skin, 0, 0.02, 0));
    head.add(this._mesh(new THREE.SphereGeometry(0.18, 10, 8), hair, 0, 0.11, -0.02));
    head.add(this._mesh(new THREE.BoxGeometry(0.18, 0.22, 0.12), hair, 0, -0.08, -0.12));

    [-0.062, 0.062].forEach(x => head.add(this._mesh(new THREE.SphereGeometry(0.024, 6, 6), new THREE.MeshStandardMaterial({ color: 0x171717 }), x, 0.05, 0.15)));

    const scarf = this._mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 16), cloth, 0, 0.17, 0);
    scarf.rotation.x = Math.PI / 2;
    torso.add(scarf);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.25, 0.2, 0);
    torso.add(leftArm);
    this.parts.leftArm = leftArm;
    leftArm.add(this._mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 8), dress, 0, -0.14, 0));

    const rightArm = new THREE.Group();
    rightArm.position.set(0.25, 0.2, 0);
    torso.add(rightArm);
    this.parts.rightArm = rightArm;
    rightArm.add(this._mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 8), dress, 0, -0.14, 0));

    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.11, -0.12, 0);
    hips.add(leftLeg);
    this.parts.leftLeg = leftLeg;
    leftLeg.add(this._mesh(new THREE.CapsuleGeometry(0.068, 0.32, 4, 8), dressDark, 0, -0.18, 0));
    leftLeg.add(this._mesh(new THREE.BoxGeometry(0.12, 0.08, 0.22), boots, 0, -0.4, 0.04));

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.11, -0.12, 0);
    hips.add(rightLeg);
    this.parts.rightLeg = rightLeg;
    rightLeg.add(this._mesh(new THREE.CapsuleGeometry(0.068, 0.32, 4, 8), dressDark, 0, -0.18, 0));
    rightLeg.add(this._mesh(new THREE.BoxGeometry(0.12, 0.08, 0.22), boots, 0, -0.4, 0.04));
  }

  setState(data = {}) {
    const x = Number(data.position_x ?? this.targetPos.x);
    const z = Number(data.position_z ?? this.targetPos.z);
    this.targetPos.set(x, 0, z);
  }

  update(delta) {
    this.animTime += delta;
    const dist = this.currentPos.distanceTo(this.targetPos);
    if (dist > 0.05) {
      const step = Math.min(this.moveSpeed * delta, dist);
      const dir = this.targetPos.clone().sub(this.currentPos).normalize();
      this.currentPos.addScaledVector(dir, step);
      this.root.position.x = this.currentPos.x;
      this.root.position.z = this.currentPos.z;
      this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, Math.atan2(dir.x, dir.z), 0.12);
    }

    const walking = dist > 0.08;
    const t = this.animTime;
    if (this.parts.leftArm) this.parts.leftArm.rotation.x = walking ? Math.sin(t * 4.2) * 0.32 : 0;
    if (this.parts.rightArm) this.parts.rightArm.rotation.x = walking ? -Math.sin(t * 4.2) * 0.32 : 0;
    if (this.parts.leftLeg) this.parts.leftLeg.rotation.x = walking ? -Math.sin(t * 4.2) * 0.34 : 0;
    if (this.parts.rightLeg) this.parts.rightLeg.rotation.x = walking ? Math.sin(t * 4.2) * 0.34 : 0;
    if (this.parts.hips) this.parts.hips.position.y = 0.72 + (walking ? Math.abs(Math.sin(t * 8.4)) * 0.02 : 0);
  }
}
