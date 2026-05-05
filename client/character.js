// character.js — 100% Procedural Persian Villager (Arash)
// No GLB loading — full control over all animations
import * as THREE from 'three';

export class Villager {
  constructor(scene) {
    this.scene      = scene;
    this.root       = new THREE.Group();
    scene.add(this.root);

    this.targetPos  = new THREE.Vector3(0, 0, 2);
    this.currentPos = new THREE.Vector3(0, 0, 2);
    this.moveSpeed  = 1.8;
    this.state      = { current_action: 'idle', energy: 80, hunger: 20 };
    this.initialized = false;
    this.parts      = {};
    this.animTime   = 0;

    this._buildGeometric();
  }

  // ── Build Procedural Body ────────────────────────────────────
  _buildGeometric() {
    const skin   = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.8 });
    const shirt  = new THREE.MeshStandardMaterial({ color: 0x7a5c2e, roughness: 0.9 });
    const pants  = new THREE.MeshStandardMaterial({ color: 0x3d4a30, roughness: 0.9 });
    const hat    = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.85 });
    const beard  = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
    const shoe   = new THREE.MeshStandardMaterial({ color: 0x1a0f05, roughness: 0.7 });
    const eye    = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
    const belt   = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.6, metalness: 0.1 });
    const buckle = new THREE.MeshStandardMaterial({ color: 0xb08030, roughness: 0.3, metalness: 0.8 });

    // Helper: add mesh to root, optionally register as a named "bone"
    const addTo = (parent, geo, mat, x, y, z, name) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      if (name) this.parts[name] = m;
      return m;
    };

    // Use groups as "bones" for arms and legs so we can rotate them naturally
    // ── HIPS (root bone) ─────────────────────────────────────
    const hipsGroup = new THREE.Group();
    hipsGroup.position.set(0, 0.77, 0);
    this.root.add(hipsGroup);
    this.parts.hips = hipsGroup;

    addTo(hipsGroup, new THREE.BoxGeometry(0.42, 0.24, 0.26), pants, 0, 0, 0);
    // Belt
    addTo(hipsGroup, new THREE.BoxGeometry(0.44, 0.07, 0.28), belt, 0, 0.15, 0);
    addTo(hipsGroup, new THREE.BoxGeometry(0.07, 0.09, 0.07), buckle, 0, 0.15, 0.145);

    // ── TORSO ─────────────────────────────────────────────────
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.37, 0); // relative to hips
    hipsGroup.add(torsoGroup);
    this.parts.torso = torsoGroup;

    addTo(torsoGroup, new THREE.CapsuleGeometry(0.19, 0.48, 4, 8), shirt, 0, 0, 0);

    // ── NECK + HEAD ────────────────────────────────────────────
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.42, 0);
    torsoGroup.add(headGroup);
    this.parts.head = headGroup;

    addTo(headGroup, new THREE.CylinderGeometry(0.07, 0.09, 0.16, 7), skin, 0, -0.1, 0, 'neck');
    addTo(headGroup, new THREE.SphereGeometry(0.175, 10, 10), skin, 0, 0.09, 0);
    // Face
    addTo(headGroup, new THREE.SphereGeometry(0.028, 6, 5), eye, -0.065, 0.12, 0.155);
    addTo(headGroup, new THREE.SphereGeometry(0.028, 6, 5), eye,  0.065, 0.12, 0.155);
    addTo(headGroup, new THREE.BoxGeometry(0.065, 0.015, 0.025), beard, -0.065, 0.146, 0.158);
    addTo(headGroup, new THREE.BoxGeometry(0.065, 0.015, 0.025), beard,  0.065, 0.146, 0.158);
    addTo(headGroup, new THREE.SphereGeometry(0.022, 5, 4), skin, 0, 0.09, 0.17);
    // Beard
    addTo(headGroup, new THREE.BoxGeometry(0.22, 0.09, 0.04), beard, 0, -0.03, 0.14);
    addTo(headGroup, new THREE.BoxGeometry(0.10, 0.12, 0.04), beard, 0, -0.10, 0.13);
    // Mustache
    addTo(headGroup, new THREE.BoxGeometry(0.16, 0.035, 0.04), beard, 0, 0.04, 0.158);
    // Hat
    addTo(headGroup, new THREE.CylinderGeometry(0.19, 0.20, 0.08, 8), hat, 0, 0.225, 0);
    addTo(headGroup, new THREE.CylinderGeometry(0.145, 0.165, 0.20, 8), hat, 0, 0.35, 0);

    // Shoulders
    addTo(torsoGroup, new THREE.SphereGeometry(0.09, 7, 5), shirt, -0.27, 0.20, 0);
    addTo(torsoGroup, new THREE.SphereGeometry(0.09, 7, 5), shirt,  0.27, 0.20, 0);

    // ── LEFT ARM (group for rotation) ─────────────────────────
    const lUpperArmGroup = new THREE.Group();
    lUpperArmGroup.position.set(-0.28, 0.17, 0);
    torsoGroup.add(lUpperArmGroup);
    this.parts.lUpperArm = lUpperArmGroup;
    addTo(lUpperArmGroup, new THREE.CapsuleGeometry(0.065, 0.22, 4, 8), shirt, 0, -0.13, 0);

    const lArmGroup = new THREE.Group();
    lArmGroup.position.set(0, -0.30, 0);
    lUpperArmGroup.add(lArmGroup);
    this.parts.lArm = lArmGroup;
    addTo(lArmGroup, new THREE.CapsuleGeometry(0.055, 0.20, 4, 8), skin, 0, -0.11, 0);
    addTo(lArmGroup, new THREE.SphereGeometry(0.065, 6, 5), skin, 0, -0.24, 0, 'lHand');

    // ── RIGHT ARM (group for rotation) ────────────────────────
    const rUpperArmGroup = new THREE.Group();
    rUpperArmGroup.position.set(0.28, 0.17, 0);
    torsoGroup.add(rUpperArmGroup);
    this.parts.rUpperArm = rUpperArmGroup;
    addTo(rUpperArmGroup, new THREE.CapsuleGeometry(0.065, 0.22, 4, 8), shirt, 0, -0.13, 0);

    const rArmGroup = new THREE.Group();
    rArmGroup.position.set(0, -0.30, 0);
    rUpperArmGroup.add(rArmGroup);
    this.parts.rArm = rArmGroup;
    addTo(rArmGroup, new THREE.CapsuleGeometry(0.055, 0.20, 4, 8), skin, 0, -0.11, 0);
    addTo(rArmGroup, new THREE.SphereGeometry(0.065, 6, 5), skin, 0, -0.24, 0, 'rHand');

    // ── LEFT LEG (group for rotation) ─────────────────────────
    const lLegGroup = new THREE.Group();
    lLegGroup.position.set(-0.13, -0.12, 0);
    hipsGroup.add(lLegGroup);
    this.parts.lLeg = lLegGroup;
    addTo(lLegGroup, new THREE.CapsuleGeometry(0.075, 0.38, 4, 8), pants, 0, -0.21, 0);
    addTo(lLegGroup, new THREE.BoxGeometry(0.14, 0.09, 0.25), shoe,  0, -0.46, 0.05);

    // ── RIGHT LEG (group for rotation) ────────────────────────
    const rLegGroup = new THREE.Group();
    rLegGroup.position.set(0.13, -0.12, 0);
    hipsGroup.add(rLegGroup);
    this.parts.rLeg = rLegGroup;
    addTo(rLegGroup, new THREE.CapsuleGeometry(0.075, 0.38, 4, 8), pants, 0, -0.21, 0);
    addTo(rLegGroup, new THREE.BoxGeometry(0.14, 0.09, 0.25), shoe,  0, -0.46, 0.05);

    console.log('[Villager] Procedural character built. Parts:', Object.keys(this.parts).join(', '));
  }

  // ── Procedural Animations ────────────────────────────────────
  _animate(delta, elapsed, action) {
    this.animTime += delta;
    const t = this.animTime;
    const p = this.parts;

    // Reset all rotations each frame for clean state
    if (p.lUpperArm) { p.lUpperArm.rotation.set(0, 0, 0); }
    if (p.rUpperArm) { p.rUpperArm.rotation.set(0, 0, 0); }
    if (p.lArm)      { p.lArm.rotation.set(0, 0, 0); }
    if (p.rArm)      { p.rArm.rotation.set(0, 0, 0); }
    if (p.lLeg)      { p.lLeg.rotation.set(0, 0, 0); }
    if (p.rLeg)      { p.rLeg.rotation.set(0, 0, 0); }
    if (p.head)      { p.head.rotation.set(0, 0, 0); }
    if (p.torso)     { p.torso.rotation.set(0, 0, 0); }

    switch (action) {
      case 'walking':
      case 'running_to_shelter': {
        const spd = action === 'running_to_shelter' ? 6 : 3.5;
        const sw  = action === 'running_to_shelter' ? 0.65 : 0.45;
        if (p.lUpperArm) p.lUpperArm.rotation.x =  Math.sin(t * spd) * sw;
        if (p.rUpperArm) p.rUpperArm.rotation.x = -Math.sin(t * spd) * sw;
        if (p.lLeg)      p.lLeg.rotation.x = -Math.sin(t * spd) * 0.55;
        if (p.rLeg)      p.rLeg.rotation.x =  Math.sin(t * spd) * 0.55;
        // Subtle body bob
        if (p.hips) p.hips.position.y = 0.77 + Math.abs(Math.sin(t * spd * 2)) * 0.03;
        break;
      }

      case 'chopping_wood': {
        // Right arm swings the axe overhead and down
        const chop = Math.sin(t * 5);
        if (p.rUpperArm) p.rUpperArm.rotation.x = -1.4 + chop * 1.4;
        if (p.rArm)      p.rArm.rotation.x      = -0.5 + chop * 0.5;
        if (p.lUpperArm) p.lUpperArm.rotation.x = -0.6 + chop * 0.3;
        if (p.torso)     p.torso.rotation.z      = Math.sin(t * 5) * 0.08;
        if (p.head)      p.head.rotation.x       = 0.3;
        break;
      }

      case 'watering_crops': {
        // Hold out one arm with a watering can
        if (p.rUpperArm) p.rUpperArm.rotation.x = -0.9 + Math.sin(t * 2) * 0.15;
        if (p.rArm)      p.rArm.rotation.x      = -0.4 + Math.sin(t * 2) * 0.1;
        if (p.lUpperArm) p.lUpperArm.rotation.x = -0.3;
        if (p.head)      p.head.rotation.x       = 0.25;
        break;
      }

      case 'eating': {
        // Right hand moves food to mouth repeatedly
        if (p.rUpperArm) p.rUpperArm.rotation.x = -1.5;
        if (p.rArm)      p.rArm.rotation.x      = -0.6 + Math.sin(t * 4) * 0.45;
        if (p.head)      p.head.rotation.x       = 0.2 + Math.sin(t * 4) * 0.1;
        if (p.lUpperArm) p.lUpperArm.rotation.x  = -0.4;
        break;
      }

      case 'sleeping': {
        // Lay entire character flat on the bed
        this.root.rotation.x = -Math.PI / 2;
        this.root.position.y = 0.55;
        // Arms relaxed at sides
        if (p.lUpperArm) p.lUpperArm.rotation.x = 0.15;
        if (p.rUpperArm) p.rUpperArm.rotation.x = 0.15;
        // Gentle breathing
        if (p.torso) p.torso.position.y = Math.sin(t * 0.8) * 0.008;
        return; // skip position.y reset at bottom
      }

      case 'praying': {
        // Both arms raised, head bowed
        if (p.lUpperArm) p.lUpperArm.rotation.x = -1.5;
        if (p.rUpperArm) p.rUpperArm.rotation.x = -1.5;
        if (p.lArm)      p.lArm.rotation.x      = -0.6;
        if (p.rArm)      p.rArm.rotation.x      = -0.6;
        if (p.head)      p.head.rotation.x       = 0.7;
        break;
      }

      case 'tending_crops':
      case 'harvesting': {
        // Bend forward, both arms working near ground
        if (p.torso)     p.torso.rotation.x      = 0.5;
        if (p.lUpperArm) p.lUpperArm.rotation.x  = -0.8 + Math.sin(t * 3) * 0.3;
        if (p.rUpperArm) p.rUpperArm.rotation.x  = -0.8 + Math.cos(t * 3) * 0.3;
        if (p.head)      p.head.rotation.x        = -0.4;
        break;
      }

      default: {
        // Idle — gentle breathing animation
        const b = Math.sin(t * 1.4) * 0.015;
        if (p.head)      p.head.rotation.x       = b;
        if (p.torso)     p.torso.position.y       = b * 0.5;
        if (p.lUpperArm) p.lUpperArm.rotation.x   = b * 0.5;
        if (p.rUpperArm) p.rUpperArm.rotation.x   = b * 0.5;
        break;
      }
    }

    // Ensure normal upright position (unless sleeping overrode it)
    this.root.rotation.x = 0;
    if (p.hips && action !== 'walking' && action !== 'running_to_shelter') {
      p.hips.position.y = 0.77;
    }
  }

  // ── Public API ───────────────────────────────────────────────
  setState(data) {
    this.state = data;
    if (data.position_x !== undefined) {
      const x = data.position_x ?? 0;
      const z = data.position_z ?? 0;
      this.targetPos.set(x, 0, z);
      if (!this.initialized) {
        this.currentPos.set(x, 0, z);
        this.root.position.set(x, 0, z);
        this.initialized = true;
      }
    }
  }

  update(delta, elapsed) {
    const action = this.state.current_action || 'idle';

    // Reset root for non-sleeping states
    if (action !== 'sleeping') {
      this.root.rotation.x = 0;
      this.root.position.y = 0;
    }

    // Move toward target
    const dist = this.currentPos.distanceTo(this.targetPos);
    if (dist > 0.05) {
      const step = Math.min(this.moveSpeed * delta, dist);
      const dir  = this.targetPos.clone().sub(this.currentPos).normalize();
      this.currentPos.addScaledVector(dir, step);
      this.root.position.x = this.currentPos.x;
      this.root.position.z = this.currentPos.z;
      const angle = Math.atan2(dir.x, dir.z);
      this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, angle, 0.12);
    }

    this._animate(delta, elapsed, action);
  }
}
