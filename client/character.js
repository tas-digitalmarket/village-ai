// character.js — 3D Procedural Character + Micro-Task Behavior System
import * as THREE from 'three';

// ── World Knowledge (plant positions, tool locations) ────────
const PLANT_POSITIONS = [
  {x:-5.5,z:5.5},{x:-6.5,z:5.5},{x:-7.5,z:5.5},
  {x:-5.5,z:6.5},{x:-6.5,z:6.5},{x:-7.5,z:6.5},
  {x:-5.5,z:7.5},{x:-6.5,z:7.5},{x:-7.5,z:7.5},
  {x:1.0, z:7.5},{x:2.0, z:7.5},{x:3.0, z:7.5},
  {x:1.0, z:8.5},{x:2.0, z:8.5},{x:3.0, z:8.5},
];

const TOOL_LOCATIONS = {
  watering_can: {x:5.5, z:2.2},   // near well
  axe:          {x:-2.5, z:3.8},  // near wood stump
  wood_stump:   {x:-3.0, z:3.5},
};

const CHOP_POSITIONS = [
  {x:-3.0,z:3.5},{x:-3.5,z:3.2},{x:-2.5,z:3.8}
];

export class Villager {
  constructor(scene) {
    this.scene       = scene;
    this.root        = new THREE.Group();
    scene.add(this.root);

    this.targetPos   = new THREE.Vector3(0, 0, 2);
    this.currentPos  = new THREE.Vector3(0, 0, 2);
    this.moveSpeed   = 2.0;
    this.state       = { current_action: 'idle', energy: 80, hunger: 20 };
    this.initialized = false;
    this.parts       = {};
    this.animTime    = 0;

    // Micro-task system
    this.microTasks    = [];
    this.microTimer    = 0;
    this.microDuration = 0;
    this.carriedItem   = null;  // 'watering_can' | 'axe' | null
    this.macroAction   = 'idle';
    this.wateredIndex  = 0;
    this.chopCount     = 0;

    // Prop meshes (held items)
    this.propMeshes = {};

    this._buildCharacter();
    this._buildProps();
  }

  // ── BUILD 3D CHARACTER ────────────────────────────────────────
  _buildCharacter() {
    // Materials
    const skin    = new THREE.MeshStandardMaterial({color:0xc68642, roughness:0.8});
    const shirt   = new THREE.MeshStandardMaterial({color:0x3a6b35, roughness:0.9});   // green plaid
    const shirtD  = new THREE.MeshStandardMaterial({color:0x2a4f28, roughness:0.9});   // dark stripe
    const pants   = new THREE.MeshStandardMaterial({color:0x8b7355, roughness:0.9});   // khaki
    const boot    = new THREE.MeshStandardMaterial({color:0x2a1a0a, roughness:0.7});
    const hair    = new THREE.MeshStandardMaterial({color:0x5a5050, roughness:1.0});   // salt & pepper
    const beard   = new THREE.MeshStandardMaterial({color:0x4a3a3a, roughness:1.0});
    const eye     = new THREE.MeshStandardMaterial({color:0x1a1a1a});
    const belt    = new THREE.MeshStandardMaterial({color:0x2a1a0a, roughness:0.6, metalness:0.1});

    const box  = (w,h,d) => new THREE.BoxGeometry(w,h,d);
    const cap  = (r,h)   => new THREE.CapsuleGeometry(r,h,4,8);
    const sph  = (r)     => new THREE.SphereGeometry(r,8,6);
    const cyl  = (r1,r2,h) => new THREE.CylinderGeometry(r1,r2,h,8);

    const mk = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = m.receiveShadow = true;
      return m;
    };

    // ── HIPS (world-space group) ──────────────────────────────
    const hips = new THREE.Group();
    hips.position.set(0, 0.75, 0);
    this.root.add(hips);
    this.parts.hips = hips;

    hips.add(Object.assign(mk(box(0.40,0.22,0.24), pants), {position: new THREE.Vector3(0,0,0)}));
    hips.add(Object.assign(mk(box(0.42,0.06,0.26), belt),  {position: new THREE.Vector3(0,0.14,0)}));

    // ── TORSO ─────────────────────────────────────────────────
    const torso = new THREE.Group();
    torso.position.set(0, 0.36, 0);
    hips.add(torso);
    this.parts.torso = torso;

    const body = mk(cap(0.175, 0.42), shirt);
    body.position.set(0, 0, 0);
    torso.add(body);

    // Plaid stripes on shirt
    const stripe1 = mk(box(0.36, 0.46, 0.01), shirtD);
    stripe1.position.set(0, 0, 0.175);
    torso.add(stripe1);

    // Shoulders
    [-0.26, 0.26].forEach(x => {
      torso.add(Object.assign(mk(sph(0.085), shirt), {position: new THREE.Vector3(x, 0.22, 0)}));
    });

    // ── HEAD ──────────────────────────────────────────────────
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.40, 0);
    torso.add(headGroup);
    this.parts.head = headGroup;

    headGroup.add(Object.assign(mk(sph(0.165), skin), {position: new THREE.Vector3(0, 0.05, 0)}));
    // Hair
    headGroup.add(Object.assign(mk(sph(0.168), hair), {position: new THREE.Vector3(0, 0.12, 0)}));
    headGroup.add(Object.assign(mk(box(0.34, 0.12, 0.20), hair), {position: new THREE.Vector3(0, 0.19, -0.04)}));
    // Eyes
    [-0.062, 0.062].forEach(x => {
      headGroup.add(Object.assign(mk(sph(0.025), eye), {position: new THREE.Vector3(x, 0.08, 0.152)}));
    });
    // Nose
    headGroup.add(Object.assign(mk(sph(0.022), skin), {position: new THREE.Vector3(0, 0.03, 0.162)}));
    // Stubble beard
    headGroup.add(Object.assign(mk(box(0.20, 0.07, 0.04), beard), {position: new THREE.Vector3(0, -0.04, 0.148)}));
    headGroup.add(Object.assign(mk(box(0.10, 0.10, 0.04), beard), {position: new THREE.Vector3(0, -0.10, 0.140)}));
    // Mustache
    headGroup.add(Object.assign(mk(box(0.14, 0.03, 0.03), beard), {position: new THREE.Vector3(0, 0.025, 0.158)}));

    // ── LEFT ARM ──────────────────────────────────────────────
    const lUA = new THREE.Group(); // upper arm pivot at shoulder
    lUA.position.set(-0.265, 0.20, 0);
    torso.add(lUA);
    this.parts.lUpperArm = lUA;
    lUA.add(Object.assign(mk(cap(0.06, 0.20), shirt), {position: new THREE.Vector3(0,-0.13,0)}));

    const lFA = new THREE.Group(); // forearm pivot at elbow
    lFA.position.set(0, -0.30, 0);
    lUA.add(lFA);
    this.parts.lArm = lFA;
    lFA.add(Object.assign(mk(cap(0.052, 0.18), skin), {position: new THREE.Vector3(0,-0.10,0)}));
    lFA.add(Object.assign(mk(sph(0.058), skin),       {position: new THREE.Vector3(0,-0.22,0)})); // hand

    // Attach watering_can to left hand
    this.leftHand = new THREE.Group();
    this.leftHand.position.set(0, -0.24, 0);
    lFA.add(this.leftHand);

    // ── RIGHT ARM ─────────────────────────────────────────────
    const rUA = new THREE.Group();
    rUA.position.set(0.265, 0.20, 0);
    torso.add(rUA);
    this.parts.rUpperArm = rUA;
    rUA.add(Object.assign(mk(cap(0.06, 0.20), shirt), {position: new THREE.Vector3(0,-0.13,0)}));

    const rFA = new THREE.Group();
    rFA.position.set(0, -0.30, 0);
    rUA.add(rFA);
    this.parts.rArm = rFA;
    rFA.add(Object.assign(mk(cap(0.052, 0.18), skin), {position: new THREE.Vector3(0,-0.10,0)}));
    rFA.add(Object.assign(mk(sph(0.058), skin),       {position: new THREE.Vector3(0,-0.22,0)}));

    // Attach axe to right hand
    this.rightHand = new THREE.Group();
    this.rightHand.position.set(0, -0.24, 0);
    rFA.add(this.rightHand);

    // ── LEFT LEG ──────────────────────────────────────────────
    const lLeg = new THREE.Group();
    lLeg.position.set(-0.12, -0.11, 0);
    hips.add(lLeg);
    this.parts.lLeg = lLeg;
    lLeg.add(Object.assign(mk(cap(0.072, 0.34), pants), {position: new THREE.Vector3(0,-0.19,0)}));
    lLeg.add(Object.assign(mk(box(0.13, 0.08, 0.24), boot), {position: new THREE.Vector3(0,-0.43,0.04)}));

    // ── RIGHT LEG ─────────────────────────────────────────────
    const rLeg = new THREE.Group();
    rLeg.position.set(0.12, -0.11, 0);
    hips.add(rLeg);
    this.parts.rLeg = rLeg;
    rLeg.add(Object.assign(mk(cap(0.072, 0.34), pants), {position: new THREE.Vector3(0,-0.19,0)}));
    rLeg.add(Object.assign(mk(box(0.13, 0.08, 0.24), boot), {position: new THREE.Vector3(0,-0.43,0.04)}));

    console.log('[Villager] 3D character built');
  }

  // ── BUILD PROPS ──────────────────────────────────────────────
  _buildProps() {
    // Watering can (simple geometric)
    const canGroup = new THREE.Group();
    const canMat = new THREE.MeshStandardMaterial({color:0xcc3322, roughness:0.5, metalness:0.2});
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.10), canMat);
    canGroup.add(body);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, 0.16, 6), canMat);
    spout.rotation.z = Math.PI / 3;
    spout.position.set(0.10, 0.04, 0);
    canGroup.add(spout);
    canGroup.visible = false;
    this.leftHand.add(canGroup);
    this.propMeshes.watering_can = canGroup;

    // Axe
    const axeGroup = new THREE.Group();
    const axeHandleMat = new THREE.MeshStandardMaterial({color:0x6b4226, roughness:0.9});
    const axeHeadMat   = new THREE.MeshStandardMaterial({color:0x888888, roughness:0.4, metalness:0.6});
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, 0.40, 6), axeHandleMat);
    handle.position.set(0, -0.15, 0);
    axeGroup.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.02), axeHeadMat);
    head.position.set(0.04, 0.06, 0);
    axeGroup.add(head);
    axeGroup.visible = false;
    this.rightHand.add(axeGroup);
    this.propMeshes.axe = axeGroup;
  }

  // ── MICRO TASK SYSTEM ────────────────────────────────────────
  _setMacroAction(action) {
    if (action === this.macroAction) return;
    this.macroAction = action;
    this.microTasks  = [];
    this.microTimer  = 0;

    // Drop current tool
    this._setCarried(null);

    switch (action) {
      case 'watering_crops': {
        this.wateredIndex = 0;
        // 1. Walk to watering can
        this.microTasks.push({type:'walk', pos:TOOL_LOCATIONS.watering_can, label:'Picking up watering can'});
        // 2. Pick it up
        this.microTasks.push({type:'pickup', item:'watering_can', duration:1.0, label:'Got the watering can'});
        // 3. For each plant: walk there, water it
        PLANT_POSITIONS.forEach((p, i) => {
          this.microTasks.push({type:'walk',  pos:p, label:`Going to plant ${i+1}`});
          this.microTasks.push({type:'water', pos:p, duration:2.5, label:`Watering plant ${i+1}`});
        });
        // 4. Return tool
        this.microTasks.push({type:'walk', pos:TOOL_LOCATIONS.watering_can, label:'Returning watering can'});
        this.microTasks.push({type:'putdown', item:'watering_can', duration:0.5});
        break;
      }
      case 'chopping_wood': {
        // 1. Walk to axe
        this.microTasks.push({type:'walk',   pos:TOOL_LOCATIONS.axe, label:'Picking up axe'});
        this.microTasks.push({type:'pickup', item:'axe', duration:0.8, label:'Got the axe'});
        // 2. Chop several times
        for (let i = 0; i < 8; i++) {
          const pos = CHOP_POSITIONS[i % CHOP_POSITIONS.length];
          this.microTasks.push({type:'walk', pos, label:'Moving to log'});
          this.microTasks.push({type:'chop', duration:4.0, label:'Chopping wood'});
        }
        // 3. Put axe back
        this.microTasks.push({type:'walk',    pos:TOOL_LOCATIONS.axe, label:'Putting axe back'});
        this.microTasks.push({type:'putdown', item:'axe', duration:0.5});
        break;
      }
      case 'harvesting':
      case 'tending_crops': {
        // Walk through field in pattern
        PLANT_POSITIONS.slice(0,8).forEach((p,i) => {
          this.microTasks.push({type:'walk',    pos:p, label:`Tending plant ${i+1}`});
          this.microTasks.push({type:'tend',    duration:2.0});
        });
        break;
      }
      // Other actions handled by macro animation only
    }
  }

  _setCarried(item) {
    this.carriedItem = item;
    Object.keys(this.propMeshes).forEach(k => {
      this.propMeshes[k].visible = (k === item);
    });
  }

  _nextMicroTask() {
    if (this.microTasks.length === 0) return;
    const task = this.microTasks.shift();
    this.currentMicroTask = task;
    this.microTimer = 0;

    if (task.type === 'walk') {
      this.targetPos.set(task.pos.x, 0, task.pos.z);
      this.microDuration = 9999; // wait until arrived
    } else {
      this.microDuration = task.duration || 2.0;
      if (task.type === 'pickup')  this._setCarried(task.item);
      if (task.type === 'putdown') this._setCarried(null);
    }
    if (task.label) console.log('[Arash]', task.label);
  }

  // ── ANIMATIONS ───────────────────────────────────────────────
  _resetPose() {
    const p = this.parts;
    if (p.lUpperArm) p.lUpperArm.rotation.set(0,0,0);
    if (p.rUpperArm) p.rUpperArm.rotation.set(0,0,0);
    if (p.lArm)      p.lArm.rotation.set(0,0,0);
    if (p.rArm)      p.rArm.rotation.set(0,0,0);
    if (p.lLeg)      p.lLeg.rotation.set(0,0,0);
    if (p.rLeg)      p.rLeg.rotation.set(0,0,0);
    if (p.head)      p.head.rotation.set(0,0,0);
    if (p.torso)     p.torso.rotation.set(0,0,0);
    if (p.hips)      p.hips.position.y = 0.75;
  }

  _animate(t, task) {
    const p = this.parts;
    this._resetPose();

    const micro = task?.type;
    const macro = this.macroAction;

    // Walking animation (used during 'walk' micro-tasks)
    const isMoving = this.currentPos.distanceTo(this.targetPos) > 0.15;
    if (isMoving) {
      const spd = macro === 'running_to_shelter' ? 7 : 4;
      const sw  = macro === 'running_to_shelter' ? 0.7 : 0.45;
      if (p.lUpperArm) p.lUpperArm.rotation.x =  Math.sin(t*spd)*sw;
      if (p.rUpperArm) p.rUpperArm.rotation.x = -Math.sin(t*spd)*sw;
      if (p.lLeg)      p.lLeg.rotation.x = -Math.sin(t*spd)*0.55;
      if (p.rLeg)      p.rLeg.rotation.x =  Math.sin(t*spd)*0.55;
      if (p.hips)      p.hips.position.y = 0.75 + Math.abs(Math.sin(t*spd*2))*0.025;
      // If carrying something, keep that arm raised slightly
      if (this.carriedItem === 'watering_can' && p.lUpperArm) p.lUpperArm.rotation.x += -0.3;
      if (this.carriedItem === 'axe' && p.rUpperArm)          p.rUpperArm.rotation.x += -0.2;
      return;
    }

    // Stationary micro-task animations
    switch (micro) {
      case 'water': {
        // Tilt forward, pour motion with left arm
        if (p.lUpperArm) p.lUpperArm.rotation.x = -0.9 + Math.sin(t*2)*0.15;
        if (p.lArm)      p.lArm.rotation.x      = -0.5 + Math.sin(t*2)*0.1;
        if (p.lUpperArm) p.lUpperArm.rotation.z  =  0.3;
        if (p.head)      p.head.rotation.x        =  0.3;
        if (p.torso)     p.torso.rotation.x        =  0.15;
        break;
      }
      case 'chop': {
        // Right arm swings axe overhead and down hard
        const chopCycle = (t * 2.2) % (Math.PI * 2);
        const rise = Math.max(0, Math.sin(chopCycle));
        const slam = Math.max(0, -Math.sin(chopCycle));
        if (p.rUpperArm) p.rUpperArm.rotation.x = -1.5 * rise + 0.4 * slam;
        if (p.rArm)      p.rArm.rotation.x      = -0.8 * rise;
        if (p.lUpperArm) p.lUpperArm.rotation.x = -0.5 * rise;
        if (p.torso)     p.torso.rotation.x      = -0.1 * rise + 0.05 * slam;
        if (p.head)      p.head.rotation.x        =  0.25;
        break;
      }
      case 'tend': {
        const bend = Math.sin(t * 2.2);
        if (p.torso)     p.torso.rotation.x      = 0.4 + bend * 0.1;
        if (p.lUpperArm) p.lUpperArm.rotation.x  = -0.7 + Math.sin(t*2.2)*0.25;
        if (p.rUpperArm) p.rUpperArm.rotation.x  = -0.7 + Math.cos(t*2.2)*0.25;
        if (p.head)      p.head.rotation.x        = -0.3;
        break;
      }
      case 'pickup': case 'putdown': {
        // Bend and reach down
        if (p.torso)     p.torso.rotation.x      =  0.5;
        if (p.rUpperArm) p.rUpperArm.rotation.x  = -1.2;
        if (p.rArm)      p.rArm.rotation.x       = -0.5;
        if (p.head)      p.head.rotation.x        = -0.3;
        break;
      }
      default: {
        // Macro-level idle animations
        switch (macro) {
          case 'eating': {
            if (p.rUpperArm) p.rUpperArm.rotation.x = -1.5;
            if (p.rArm)      p.rArm.rotation.x      = -0.5 + Math.sin(t*3.5)*0.4;
            if (p.head)      p.head.rotation.x       =  0.2 + Math.sin(t*3.5)*0.08;
            break;
          }
          case 'sleeping': {
            this.root.rotation.x = -Math.PI/2;
            this.root.position.y = 0.55;
            if (p.hips) p.hips.position.y = 0.75;
            if (p.lUpperArm) p.lUpperArm.rotation.x = 0.2;
            if (p.rUpperArm) p.rUpperArm.rotation.x = 0.2;
            return;
          }
          case 'sitting': {
            if (p.lLeg) p.lLeg.rotation.x =  0.8;
            if (p.rLeg) p.rLeg.rotation.x =  0.8;
            if (p.hips) p.hips.position.y = 0.50;
            const breath = Math.sin(t*1.2)*0.012;
            if (p.torso) p.torso.rotation.x = breath;
            break;
          }
          case 'checking_motorcycle': {
            if (p.lUpperArm) p.lUpperArm.rotation.x = -0.6 + Math.sin(t*1.5)*0.2;
            if (p.rUpperArm) p.rUpperArm.rotation.x = -0.6 + Math.cos(t*1.5)*0.2;
            if (p.head)      p.head.rotation.y       = Math.sin(t*0.5)*0.3;
            break;
          }
          default: {
            // Idle breathing
            const b = Math.sin(t*1.4)*0.012;
            if (p.head) p.head.rotation.x = b;
            break;
          }
        }
      }
    }

    // Reset sleeping rotation if not sleeping
    if (macro !== 'sleeping') {
      this.root.rotation.x = 0;
      this.root.position.y = 0;
    }
  }

  // ── Public API ───────────────────────────────────────────────
  setState(data) {
    this.state = data;
    if (data.position_x !== undefined) {
      const x = data.position_x ?? 0;
      const z = data.position_z ?? 0;
      // Only set macro target if no micro-tasks running
      if (this.microTasks.length === 0 && !this.currentMicroTask) {
        this.targetPos.set(x, 0, z);
      }
      if (!this.initialized) {
        this.currentPos.set(x, 0, z);
        this.root.position.set(x, 0, z);
        this.initialized = true;
      }
    }
    const action = data.current_action || 'idle';
    this._setMacroAction(action);
    if (this.microTasks.length > 0 && !this.currentMicroTask) {
      this._nextMicroTask();
    }
  }

  update(delta, elapsed) {
    this.animTime += delta;
    const t = this.animTime;

    // Ensure sleeping overrides position
    if (this.macroAction !== 'sleeping') {
      this.root.rotation.x = 0;
      this.root.position.y = 0;
    }

    // ── Micro-task tick ───────────────────────────────────────
    if (this.currentMicroTask) {
      const task = this.currentMicroTask;
      this.microTimer += delta;

      if (task.type === 'walk') {
        // Check arrival
        const dist = this.currentPos.distanceTo(this.targetPos);
        if (dist < 0.12) {
          this.currentMicroTask = null;
          this._nextMicroTask();
        }
      } else {
        // Timed task: complete after duration
        if (this.microTimer >= this.microDuration) {
          this.currentMicroTask = null;
          this._nextMicroTask();
        }
      }
    } else if (this.microTasks.length > 0) {
      this._nextMicroTask();
    }

    // ── Movement ──────────────────────────────────────────────
    const dist = this.currentPos.distanceTo(this.targetPos);
    if (dist > 0.05) {
      const step = Math.min(this.moveSpeed * delta, dist);
      const dir  = this.targetPos.clone().sub(this.currentPos).normalize();
      this.currentPos.addScaledVector(dir, step);
      this.root.position.x = this.currentPos.x;
      this.root.position.z = this.currentPos.z;
      const angle = Math.atan2(dir.x, dir.z);
      this.root.rotation.y = THREE.MathUtils.lerp(this.root.rotation.y, angle, 0.15);
    }

    // ── Animate ───────────────────────────────────────────────
    this._animate(t, this.currentMicroTask);
  }
}
