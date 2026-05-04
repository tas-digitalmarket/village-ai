// weather-fx.js — Rain particles, fog, sky tinting
import * as THREE from 'three';

export class WeatherFX {
  constructor(scene, camera) {
    this.scene   = scene;
    this.camera  = camera;
    this.current = 'sunny';
    this.rainSystem = null;
    this.windAngle  = 0;

    this._buildRain();
  }

  _buildRain() {
    const count = 3000;
    const geo   = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count); // per-drop speed

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      velocities[i]        = 8 + Math.random() * 6;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.userData.velocities = velocities;

    const mat = new THREE.PointsMaterial({
      color: 0x99ccff,
      size: 0.07,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true
    });

    this.rainSystem = new THREE.Points(geo, mat);
    this.rainSystem.visible = false;
    this.scene.add(this.rainSystem);
  }

  setWeather(type) {
    if (this.current === type) return;
    this.current = type;

    const isRainy   = type === 'rainy' || type === 'stormy';
    const isFoggy   = type === 'foggy';
    const isWindy   = type === 'windy';
    const isStormy  = type === 'stormy';

    // Rain
    this.rainSystem.visible = isRainy;
    this.rainSystem.material.opacity = isStormy ? 0.85 : 0.6;

    // Fog
    if (isFoggy) {
      this.scene.fog = new THREE.FogExp2(0x9aabb5, 0.04);
    } else if (isRainy || isStormy) {
      this.scene.fog = new THREE.FogExp2(0x556066, 0.025);
    } else if (isWindy) {
      this.scene.fog = new THREE.FogExp2(0x8db8a0, 0.012);
    } else {
      this.scene.fog = new THREE.FogExp2(0x8db8a0, 0.010);
    }

    console.log('[WeatherFX] Weather set to:', type);
  }

  update(delta, elapsed) {
    if (!this.rainSystem.visible) return;

    const pos = this.rainSystem.geometry.attributes.position;
    const vel = this.rainSystem.geometry.userData.velocities;
    const windX = this.current === 'stormy' ? 2.5 : 0.5;

    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) - vel[i] * delta);
      pos.setX(i, pos.getX(i) + windX * delta);

      if (pos.getY(i) < -1) {
        pos.setY(i, 25 + Math.random() * 5);
        pos.setX(i, (Math.random() - 0.5) * 60);
        pos.setZ(i, (Math.random() - 0.5) * 60);
      }
    }

    pos.needsUpdate = true;

    // Follow camera horizontally
    this.rainSystem.position.x = this.camera.position.x;
    this.rainSystem.position.z = this.camera.position.z;
  }
}
