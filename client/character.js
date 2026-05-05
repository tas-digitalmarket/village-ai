// character.js — Animated 2D Sprite Billboard Character (Arash)
// Uses cartoon-style images with white-background removal for a clean look
import * as THREE from 'three';

const SPRITE_MAP = {
  idle:              '/sprites/arash_idle.png',
  walking:           '/sprites/arash_walk.png',
  running_to_shelter:'/sprites/arash_walk.png',
  chopping_wood:     '/sprites/arash_chop.png',
  watering_crops:    '/sprites/arash_water.png',
  tending_crops:     '/sprites/arash_water.png',
  harvesting:        '/sprites/arash_chop.png',
  eating:            '/sprites/arash_eat.png',
  sleeping:          '/sprites/arash_sleep.png',
  praying:           '/sprites/arash_idle.png',
};

const loader = new THREE.TextureLoader();

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
    this.animTime   = 0;
    this.currentAction = 'idle';

    // Texture cache
    this.textures   = {};
    this.sprite     = null;
    this.spriteMesh = null;

    // Shadow blob on ground
    const shadowGeo = new THREE.CircleGeometry(0.35, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = 0.02;
    this.root.add(this.shadowMesh);

    this._preloadTextures(() => this._buildSprite());
  }

  _preloadTextures(onDone) {
    const keys = Object.keys(SPRITE_MAP);
    const unique = [...new Set(Object.values(SPRITE_MAP))];
    let loaded = 0;
    unique.forEach(url => {
      loader.load(url, tex => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        // Store by url
        this.textures[url] = tex;
        loaded++;
        if (loaded === unique.length) onDone();
      }, undefined, () => {
        // On error, store null
        this.textures[url] = null;
        loaded++;
        if (loaded === unique.length) onDone();
      });
    });
  }

  _buildSprite() {
    // Create a plane that always faces camera (billboard)
    const geo = new THREE.PlaneGeometry(1.4, 2.2);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.15,  // cut out the white background
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.spriteMesh = new THREE.Mesh(geo, mat);
    this.spriteMesh.position.y = 1.1; // raise to stand on ground
    this.root.add(this.spriteMesh);

    this._setTexture('idle');
    console.log('[Villager] Sprite character ready');
  }

  _setTexture(action) {
    const url = SPRITE_MAP[action] || SPRITE_MAP['idle'];
    const tex = this.textures[url];
    if (!tex || !this.spriteMesh) return;
    if (this.spriteMesh.material.map === tex) return; // already set
    this.spriteMesh.material.map = tex;
    this.spriteMesh.material.needsUpdate = true;
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

  update(delta, elapsed, camera) {
    this.animTime += delta;
    const t = this.animTime;
    const action = this.state.current_action || 'idle';

    // Switch sprite texture based on action
    if (action !== this.currentAction) {
      this.currentAction = action;
      this._setTexture(action);
    }

    // Always face the camera (billboard)
    if (this.spriteMesh && camera) {
      this.root.quaternion.copy(camera.quaternion);
    }

    // Move toward target position
    const dist = this.currentPos.distanceTo(this.targetPos);
    if (dist > 0.05) {
      const step = Math.min(this.moveSpeed * delta, dist);
      const dir  = this.targetPos.clone().sub(this.currentPos).normalize();
      this.currentPos.addScaledVector(dir, step);
      this.root.position.x = this.currentPos.x;
      this.root.position.z = this.currentPos.z;
    }

    // Animations via scale/position bob on the sprite
    if (!this.spriteMesh) return;

    if (action === 'sleeping') {
      // Lay flat — tilt sprite horizontal
      this.spriteMesh.rotation.z = Math.PI / 2;
      this.spriteMesh.position.y = 0.4;
      this.spriteMesh.scale.set(1, 1, 1);
    } else {
      this.spriteMesh.rotation.z = 0;
      this.spriteMesh.position.y = 1.1;

      switch (action) {
        case 'walking':
        case 'running_to_shelter': {
          const spd = action === 'running_to_shelter' ? 9 : 5;
          // Bob up and down while walking
          this.spriteMesh.position.y = 1.1 + Math.abs(Math.sin(t * spd)) * 0.06;
          // Slight lean forward
          this.spriteMesh.rotation.z = Math.sin(t * spd) * 0.05;
          break;
        }
        case 'chopping_wood': {
          // Swing up and slam down
          const phase = Math.sin(t * 5);
          this.spriteMesh.position.y = 1.1 + (phase > 0 ? phase * 0.15 : 0);
          this.spriteMesh.rotation.z = phase * 0.12;
          break;
        }
        case 'watering_crops':
        case 'tending_crops': {
          // Gentle side-to-side sway
          this.spriteMesh.rotation.z = Math.sin(t * 2) * 0.04;
          break;
        }
        case 'eating': {
          // Nod head (scale Y slightly)
          const nod = 1 + Math.sin(t * 4) * 0.02;
          this.spriteMesh.scale.set(1, nod, 1);
          break;
        }
        default: {
          // Idle breathing — very gentle scale pulse
          const breath = 1 + Math.sin(t * 1.5) * 0.012;
          this.spriteMesh.scale.set(breath, breath, 1);
          break;
        }
      }
    }

    // Shadow scales with distance from camera
    if (this.shadowMesh) {
      this.shadowMesh.scale.setScalar(action === 'sleeping' ? 1.5 : 1.0);
    }
  }
}
