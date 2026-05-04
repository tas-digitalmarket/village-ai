// character.js — Realistic villager: tries public GLB, falls back to detailed PBR geometric model
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Public GLB URLs to try (CORS-enabled)
const PUBLIC_MODELS = [
  '/models/villager.glb',
  'https://threejs.org/examples/models/gltf/Soldier.glb',
];

export class Villager {
  constructor(scene) {
    this.scene       = scene;
    this.root        = new THREE.Group();
    scene.add(this.root);

    this.targetPos   = new THREE.Vector3(0, 0, 2);
    this.currentPos  = new THREE.Vector3(0, 0, 2);
    this.moveSpeed   = 1.8;
    this.state       = { current_action: 'idle', energy: 80, hunger: 20 };
    this.initialized = false;

    this.mixer    = null;
    this.clips    = {};
    this.activeClip = null;
    this.parts    = {};
    this.animTime = 0;
    this.isGLTF   = false;

    this._tryLoadModels(0);
  }

  _tryLoadModels(idx) {
    if (idx >= PUBLIC_MODELS.length) {
      this._buildGeometric();
      return;
    }
    const loader = new GLTFLoader();
    loader.load(
      PUBLIC_MODELS[idx],
      (gltf) => {
        this.isGLTF = true;
        const model = gltf.scene;

        // Auto-scale: measure bounding box, normalize to 1.8 units tall
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetHeight = 1.8;
        const scaleFactor = maxDim > 0 ? targetHeight / maxDim : 1;
        model.scale.setScalar(scaleFactor);
        console.log(`[Villager] Auto-scale: ${maxDim.toFixed(2)} → factor ${scaleFactor.toFixed(3)}`);

        // Re-compute after scale to center at ground level
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y = -box2.min.y; // sit on ground
        this.root.add(model);

        // Robust bone detection patterns
        const findBone = (name) => {
          const n = name.toLowerCase();
          if (n.includes('hips') || n.includes('pelvis') || n.includes('root')) return 'hips';
          if (n.includes('spine2') || n.includes('chest') || n.includes('spine_02')) return 'torso';
          if (n.includes('neck')) return 'neck';
          if (n.includes('head')) return 'head';
          
          // Left Arm patterns
          if ((n.includes('leftarm') || n.includes('arm_l') || n.includes('l_arm') || n.includes('upperarm_l')) && !n.includes('fore')) return 'lUpperArm';
          if (n.includes('leftforearm') || n.includes('forearm_l') || n.includes('l_forearm')) return 'lArm';
          
          // Right Arm patterns
          if ((n.includes('rightarm') || n.includes('arm_r') || n.includes('r_arm') || n.includes('upperarm_r')) && !n.includes('fore')) return 'rUpperArm';
          if (n.includes('rightforearm') || n.includes('forearm_r') || n.includes('r_forearm')) return 'rArm';
          
          // Legs
          if (n.includes('leftupleg') || n.includes('thigh_l') || n.includes('l_thigh')) return 'lLeg';
          if (n.includes('rightupleg') || n.includes('thigh_r') || n.includes('r_thigh')) return 'rLeg';
          return null;
        };

        model.traverse((c) => {
          if (c.isBone) {
            const part = findBone(c.name);
            if (part) {
              this.parts[part] = c;
              console.log(`[Villager] Mapped ${c.name} → ${part}`);
            }
          }
          if (c.isMesh) {
            c.castShadow = true; c.receiveShadow = true;
            if (c.material) {
              const old = c.material;
              c.material = new THREE.MeshStandardMaterial({
                map: old.map || null,
                color: old.color || 0xffffff,
                roughness: 0.8, metalness: 0.05
              });
            }
          }
        });

        if (gltf.animations.length) {
          this.mixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach((clip) => {
            this.clips[clip.name.toLowerCase()] = this.mixer.clipAction(clip);
          });
          this._playGLTF('idle');
        }
        console.log('[Villager] Loaded & Mapped bones:', PUBLIC_MODELS[idx]);
      },
      undefined,
      () => this._tryLoadModels(idx + 1)
    );
  }

  // ── Detailed Geometric Character ────────────────────────────
  _buildGeometric() {
    console.log('[Villager] Building geometric character');

    const skin   = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.8, metalness: 0.0 });
    const shirt  = new THREE.MeshStandardMaterial({ color: 0x7a5c2e, roughness: 0.9 }); // linen
    const pants  = new THREE.MeshStandardMaterial({ color: 0x3d4a30, roughness: 0.9 }); // dark green
    const hat    = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.85 });
    const beard  = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
    const shoe   = new THREE.MeshStandardMaterial({ color: 0x1a0f05, roughness: 0.7 });
    const eye    = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
    const belt   = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.6, metalness: 0.1 });
    const buckle = new THREE.MeshStandardMaterial({ color: 0xb08030, roughness: 0.3, metalness: 0.8 });

    const add = (geo, mat, x, y, z, name, rx=0, ry=0, rz=0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
      if (name) this.parts[name] = m;
      return m;
    };

    // ── Legs ────────────────────────────────────────────────────
    add(new THREE.CapsuleGeometry(0.075, 0.38, 4, 8), pants, -0.13, 0.43, 0, 'lLeg');
    add(new THREE.CapsuleGeometry(0.075, 0.38, 4, 8), pants,  0.13, 0.43, 0, 'rLeg');
    // Feet / shoes
    add(new THREE.BoxGeometry(0.14, 0.09, 0.25), shoe, -0.13, 0.19, 0.05, 'lFoot');
    add(new THREE.BoxGeometry(0.14, 0.09, 0.25), shoe,  0.13, 0.19, 0.05, 'rFoot');

    // ── Hips + Torso ────────────────────────────────────────────
    add(new THREE.BoxGeometry(0.42, 0.24, 0.26), pants, 0, 0.77, 0, 'hips');
    // Belt
    add(new THREE.BoxGeometry(0.44, 0.07, 0.28), belt, 0, 0.92, 0);
    add(new THREE.BoxGeometry(0.07, 0.09, 0.07), buckle, 0, 0.92, 0.145);
    // Shirt torso
    add(new THREE.CapsuleGeometry(0.19, 0.48, 4, 8), shirt, 0, 1.14, 0, 'torso');

    // ── Arms ────────────────────────────────────────────────────
    // Upper arm
    const lUpperArm = add(new THREE.CapsuleGeometry(0.065, 0.22, 4, 8), shirt, -0.29, 1.14, 0, 'lUpperArm');
    const rUpperArm = add(new THREE.CapsuleGeometry(0.065, 0.22, 4, 8), shirt,  0.29, 1.14, 0, 'rUpperArm');
    // Forearm
    add(new THREE.CapsuleGeometry(0.055, 0.20, 4, 8), skin, -0.29, 0.82, 0, 'lArm');
    add(new THREE.CapsuleGeometry(0.055, 0.20, 4, 8), skin,  0.29, 0.82, 0, 'rArm');
    // Hands
    add(new THREE.SphereGeometry(0.065, 6, 5), skin, -0.29, 0.64, 0, 'lHand');
    add(new THREE.SphereGeometry(0.065, 6, 5), skin,  0.29, 0.64, 0, 'rHand');

    // ── Shoulders (epaulettes) ───────────────────────────────────
    add(new THREE.SphereGeometry(0.09, 7, 5), shirt, -0.27, 1.35, 0);
    add(new THREE.SphereGeometry(0.09, 7, 5), shirt,  0.27, 1.35, 0);

    // ── Neck + Head ─────────────────────────────────────────────
    add(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 7), skin, 0, 1.6, 0, 'neck');
    add(new THREE.SphereGeometry(0.175, 10, 10), skin, 0, 1.79, 0, 'head');

    // ── Face Details ─────────────────────────────────────────────
    // Eyes
    add(new THREE.SphereGeometry(0.028, 6, 5), eye, -0.065, 1.82, 0.155);
    add(new THREE.SphereGeometry(0.028, 6, 5), eye,  0.065, 1.82, 0.155);
    // Eyebrows (dark strip)
    add(new THREE.BoxGeometry(0.065, 0.015, 0.025), beard, -0.065, 1.856, 0.158);
    add(new THREE.BoxGeometry(0.065, 0.015, 0.025), beard,  0.065, 1.856, 0.158);
    // Nose
    add(new THREE.SphereGeometry(0.022, 5, 4), skin, 0, 1.79, 0.17);
    // Mouth
    add(new THREE.BoxGeometry(0.07, 0.018, 0.02), beard, 0, 1.755, 0.165);
    // Beard
    add(new THREE.SphereGeometry(0.09, 7, 5), beard, 0, 1.71, 0.1);
    add(new THREE.ConeGeometry(0.065, 0.18, 6), beard, 0, 1.60, 0.1, null, -0.35);
    // Mustache
    add(new THREE.CapsuleGeometry(0.018, 0.06, 3, 6), beard, -0.04, 1.77, 0.17);
    add(new THREE.CapsuleGeometry(0.018, 0.06, 3, 6), beard,  0.04, 1.77, 0.17);
    // Ears
    add(new THREE.SphereGeometry(0.03, 5, 4), skin, -0.175, 1.79, 0);
    add(new THREE.SphereGeometry(0.03, 5, 4), skin,  0.175, 1.79, 0);

    // ── Hat ─────────────────────────────────────────────────────
    add(new THREE.CylinderGeometry(0.175, 0.175, 0.24, 10), hat, 0, 1.985, 0, 'hat');
    add(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 10), hat, 0, 1.865, 0); // brim
    // Hat band
    add(new THREE.CylinderGeometry(0.178, 0.178, 0.06, 10, 1, true), belt, 0, 1.89, 0);
  }

  // ── GLTF Animation ──────────────────────────────────────────
  _playGLTF(name) {
    const MAP = { idle:'Idle', walking:'Walk', running_to_shelter:'Run', sleeping:'Idle' };
    const key = MAP[name] || 'Idle';
    const found = Object.keys(this.clips).find(k => k.toLowerCase().includes(key.toLowerCase()))
               || Object.keys(this.clips)[0];
    if (!found) return;
    const action = this.clips[found];
    if (this.activeClip && this.activeClip !== action) {
      this.activeClip.fadeOut(0.3);
      action.reset().fadeIn(0.3).play();
    } else action.play();
    this.activeClip = action;
  }

  // ── Procedural Animation ─────────────────────────────────────
  _animateGeometric(delta, elapsed, action) {
    if (Object.keys(this.parts).length === 0) return;
    this.animTime += delta;
    const t = this.animTime;
    const p = this.parts;

    // Nuclear T-Pose Fix: Rotate ANY bone that could be an arm
    if (this.isGLTF) {
      this.root.traverse(b => {
        if (b.isBone) {
          const n = b.name.toLowerCase();
          if (n.includes('arm') && !n.includes('fore') && !n.includes('hand')) {
             if (n.includes('l')) b.rotation.z = 1.3;
             if (n.includes('r')) b.rotation.z = -1.3;
          }
        }
      });
      // Specific mapping for identified parts
      if (p.lUpperArm) { p.lUpperArm.rotation.z = 1.3; p.lUpperArm.rotation.x = 0.2; }
      if (p.rUpperArm) { p.rUpperArm.rotation.z = -1.3; p.rUpperArm.rotation.x = 0.2; }
    }

    // Reset rotations for clean animation frame (except Z which fixes T-pose)
    ['lArm','rArm','lLeg','rLeg','lUpperArm','rUpperArm'].forEach(k => {
      if (p[k]) { p[k].rotation.x = 0; }
    });
    if (p.head) p.head.rotation.x = 0;

    switch (action) {
      case 'walking':
      case 'running_to_shelter': {
        const spd = action === 'running_to_shelter' ? 6 : 3.5;
        const sw  = action === 'running_to_shelter' ? 0.7 : 0.5;
        if (p.lUpperArm) p.lUpperArm.rotation.x =  Math.sin(t*spd)*sw;
        if (p.rUpperArm) p.rUpperArm.rotation.x = -Math.sin(t*spd)*sw;
        if (p.lLeg)  p.lLeg.rotation.x = -Math.sin(t*spd)*0.55;
        if (p.rLeg)  p.rLeg.rotation.x =  Math.sin(t*spd)*0.55;
        break;
      }
      case 'chopping_wood': {
        if (p.rUpperArm) p.rUpperArm.rotation.x = -1.2 + Math.sin(t*5)*1.2;
        if (p.rArm)      p.rArm.rotation.x      = -0.5 + Math.sin(t*5)*0.5;
        if (p.lUpperArm) p.lUpperArm.rotation.x = -0.8 + Math.sin(t*5)*0.4;
        break;
      }
      case 'watering_crops': {
        if (p.rUpperArm) p.rUpperArm.rotation.x = -0.8 + Math.sin(t*3)*0.3;
        if (p.lUpperArm) p.lUpperArm.rotation.x = -0.4 + Math.cos(t*3)*0.2;
        break;
      }
      case 'eating': {
        if (p.rUpperArm) p.rUpperArm.rotation.x = -1.5;
        if (p.rArm)      p.rArm.rotation.x      = -0.6 + Math.sin(t*4)*0.4;
        if (p.head)      p.head.rotation.x      = 0.2 + Math.sin(t*4)*0.1;
        break;
      }
      case 'sleeping': {
        if (this.isGLTF) {
          this.root.rotation.x = -Math.PI/2;
          this.root.position.y = 0.55;
          if (p.lUpperArm) p.lUpperArm.rotation.z = 0.2;
          if (p.rUpperArm) p.rUpperArm.rotation.z = -0.2;
        } else {
          if (p.torso) { p.torso.rotation.x = Math.PI/2; p.torso.position.y = 0.5; }
          if (p.head)  { p.head.position.y = 0.52; p.head.rotation.x = Math.PI/2; }
        }
        break;
      }
      case 'praying': {
        if (p.lUpperArm) p.lUpperArm.rotation.x = -1.6;
        if (p.rUpperArm) p.rUpperArm.rotation.x = -1.6;
        if (p.head)      p.head.rotation.x = 0.6;
        break;
      }
      default: {
        const b = Math.sin(t*1.5)*0.02;
        if (p.head) p.head.rotation.x = b;
      }
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
    if (this.isGLTF && this.mixer) {
      const actionName = (data.current_action || 'idle').toLowerCase();
      // More fuzzy matching for animations
      const clipKey = Object.keys(this.clips).find(k => k.includes(actionName));
      if (clipKey) {
        this._playGLTF(clipKey);
        this.useProcedural = false;
      } else {
        if (this.activeClip) this.activeClip.stop();
        this.useProcedural = true;
      }
    } else {
      this.useProcedural = true;
    }
  }

  update(delta, elapsed) {
    const action = this.state.current_action || 'idle';
    const dist = this.currentPos.distanceTo(this.targetPos);
    
    // Reset root transforms if not sleeping
    if (action !== 'sleeping') {
      this.root.rotation.x = 0;
      this.root.position.y = 0;
    }

    if (dist > 0.05) {
      const step = Math.min(this.moveSpeed * delta, dist);
      const dir  = this.targetPos.clone().sub(this.currentPos).normalize();
      this.currentPos.addScaledVector(dir, step);
      this.root.position.x = this.currentPos.x;
      this.root.position.z = this.currentPos.z;
      const angle = Math.atan2(dir.x, dir.z);
      this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, angle, 0.12);
    }
    
    if (this.mixer && !this.useProcedural) {
      this.mixer.update(delta);
    } else {
      this._animateGeometric(delta, elapsed, action);
    }

    // FINAL OVERRIDE for Sleeping (force it to stay rotated)
    if (action === 'sleeping') {
      this.root.rotation.x = -Math.PI/2;
      this.root.position.y = 0.55;
    }
  }
}
