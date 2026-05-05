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
    const geo = new THREE.PlaneGeometry(1.6, 2.4);

    // Custom shader: discards white and near-white pixels
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, opacity: { value: 1.0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform float opacity;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(map, vUv);
          // Discard pixels that are white or near-white (background removal)
          float brightness = dot(c.rgb, vec3(0.333));
          if (brightness > 0.88 && c.r > 0.80 && c.g > 0.80 && c.b > 0.80) discard;
          gl_FragColor = vec4(c.rgb, opacity);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.spriteMesh = new THREE.Mesh(geo, mat);
    this.spriteMesh.position.y = 1.2;
    // Exclude from bloom layer
    this.spriteMesh.layers.disable(1);
    this.root.add(this.spriteMesh);

    this._setTexture('idle');
    console.log('[Villager] Sprite ready with white-removal shader');
  }

  _setTexture(action) {
    const url = SPRITE_MAP[action] || SPRITE_MAP['idle'];
    const tex = this.textures[url];
    if (!tex || !this.spriteMesh) return;
    if (this.spriteMesh.material.uniforms.map.value === tex) return;
    this.spriteMesh.material.uniforms.map.value = tex;
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
      this.spriteMesh.rotation.z = Math.PI / 2;
      this.spriteMesh.position.y = 0.5;
      // Gentle breathing scale
      const br = 1 + Math.sin(t * 0.7) * 0.015;
      this.spriteMesh.scale.set(br, 1, 1);
    } else {
      this.spriteMesh.rotation.z = 0;
      this.spriteMesh.position.y = 1.2;

      switch (action) {
        case 'walking': {
          // Strong up-down bob + slight side lean
          this.spriteMesh.position.y = 1.2 + Math.abs(Math.sin(t * 6)) * 0.09;
          this.spriteMesh.rotation.z = Math.sin(t * 6) * 0.06;
          break;
        }
        case 'running_to_shelter': {
          // Fast urgent movement
          this.spriteMesh.position.y = 1.2 + Math.abs(Math.sin(t * 11)) * 0.13;
          this.spriteMesh.rotation.z = Math.sin(t * 11) * 0.12;
          this.spriteMesh.scale.setScalar(1 + Math.sin(t * 11) * 0.02);
          break;
        }
        case 'chopping_wood': {
          // Big slam: rise high, drop fast
          const chopCycle = (t * 2.5) % (Math.PI * 2);
          const chopY = Math.max(0, Math.sin(chopCycle));
          this.spriteMesh.position.y = 1.2 + chopY * 0.18;
          this.spriteMesh.rotation.z = -chopY * 0.18;
          // Vibrate on impact
          if (chopCycle > Math.PI && chopCycle < Math.PI + 0.3) {
            this.spriteMesh.position.x = (Math.random() - 0.5) * 0.04;
          } else {
            this.spriteMesh.position.x = 0;
          }
          break;
        }
        case 'watering_crops': {
          // Tilt forward as if pouring, sway side to side
          this.spriteMesh.rotation.z = Math.sin(t * 1.8) * 0.09 + 0.08;
          this.spriteMesh.position.y = 1.2 + Math.sin(t * 1.8) * 0.03;
          break;
        }
        case 'tending_crops':
        case 'harvesting': {
          // Bend forward and back rhythmically
          const bend = Math.sin(t * 2.5);
          this.spriteMesh.position.y = 1.2 - (bend > 0 ? bend * 0.12 : 0);
          this.spriteMesh.rotation.z = bend * 0.1;
          break;
        }
        case 'tending_animals': {
          // Bobbing — crouching to pet, standing
          this.spriteMesh.position.y = 1.2 - Math.abs(Math.sin(t * 1.5)) * 0.1;
          this.spriteMesh.rotation.z = Math.sin(t * 1.5) * 0.06;
          break;
        }
        case 'eating': {
          // Nod head rhythmically (eating motion)
          const eat = Math.sin(t * 3.5);
          this.spriteMesh.position.y = 1.2 + eat * 0.04;
          this.spriteMesh.scale.y = 1 + eat * 0.025;
          break;
        }
        case 'praying': {
          // Slow bow forward and return (rukoo motion)
          const bow = Math.sin(t * 0.8) * 0.5 + 0.5;
          this.spriteMesh.rotation.z = bow * 0.22;
          this.spriteMesh.position.y = 1.2 - bow * 0.06;
          break;
        }
        case 'fishing': {
          // Cast and wait: slight lean forward, occasional small jerk
          this.spriteMesh.rotation.z = 0.1 + Math.sin(t * 0.5) * 0.03;
          if (Math.random() < 0.005) {
            // Fish tug!
            this.spriteMesh.position.y = 1.2 + 0.12;
            setTimeout(() => { if (this.spriteMesh) this.spriteMesh.position.y = 1.2; }, 150);
          }
          break;
        }
        case 'sitting': {
          // Very still with slight breathing
          const sit = Math.sin(t * 1.2) * 0.012;
          this.spriteMesh.position.y = 1.2 + sit;
          this.spriteMesh.scale.set(1 + sit, 1 + sit * 0.5, 1);
          break;
        }
        case 'checking_motorcycle': {
          // Lean forward and back, admiring the bike
          this.spriteMesh.rotation.z = Math.sin(t * 2) * 0.12;
          this.spriteMesh.position.y = 1.2 + Math.sin(t * 2) * 0.05;
          break;
        }
        case 'wandering': {
          // Casual slow walk
          this.spriteMesh.position.y = 1.2 + Math.abs(Math.sin(t * 3)) * 0.05;
          this.spriteMesh.rotation.z = Math.sin(t * 3) * 0.04;
          break;
        }
        default: {
          // Idle breathing
          const breath = 1 + Math.sin(t * 1.4) * 0.012;
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
