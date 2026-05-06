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
  watering_can: {x:5.5, z:2.2},
  axe:          {x:-2.5, z:3.8},
  wood_stump:   {x:-3.0, z:3.5},
};

// ── Indoor Positions (cottage is at 0,0,-8) ─────────────────
const INSIDE_BED    = { x: -2.5, z: -9.5 }; // bed inside house
const INSIDE_TABLE  = { x:  2.2, z: -9.0 }; // table inside house
const INSIDE_CENTER = { x:  0.0, z: -8.5 }; // center of house
const HOUSE_DOOR    = { x:  0.0, z: -5.5 }; // just inside the door

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

    this.microTasks    = [];
    this.microTimer    = 0;
    this.microDuration = 0;
    this.carriedItem   = null;
    this.macroAction   = 'idle';
    this.wateredIndex  = 0;
    this.chopCount     = 0;

    this.propMeshes = {};

    this._buildCharacter();
    this._buildProps();
  }

  _buildCharacter() {
    const skin    = new THREE.MeshStandardMaterial({color:0xc68642, roughness:0.8});
    const shirt   = new THREE.MeshStandardMaterial({color:0x3a6b35, roughness:0.9});
    const shirtD  = new THREE.MeshStandardMaterial({color:0x2a4f28, roughness:0.9});
    const pants   = new THREE.MeshStandardMaterial({color:0x8b7355, roughness:0.9});
    const boot    = new THREE.MeshStandardMaterial({color:0x2a1a0a, roughness:0.7});
    const hair    = new THREE.MeshStandardMaterial({color:0x5a5050, roughness:1.0});
    const beard   = new THREE.MeshStandardMaterial({color:0x4a3a3a, roughness:1.0});
    const eye     = new THREE.MeshStandardMaterial({color:0x1a1a1a});
    const belt    = new THREE.MeshStandardMaterial({color:0x2a1a0a, roughness:0.6, metalness:0.1});

    const box  = (w,h,d) => new THREE.BoxGeometry(w,h,d);
    const cap  = (r,h)   => new THREE.CapsuleGeometry(r,h,4,8);
    const sph  = (r)     => new THREE.SphereGeometry(r,8,6);

    const mk = (geo, mat, x=0, y=0, z=0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      return m;
    };

    // ── HIPS ──────────────────────────────────────────────────
    const hips = new THREE.Group();
    hips.position.set(0, 0.75, 0);
    this.root.add(hips);
    this.parts.hips = hips;

    hips.add(mk(box(0.40,0.22,0.24), pants, 0, 0, 0));
    hips.add(mk(box(0.42,0.06,0.26), belt,  0, 0.14, 0));

    // ── TORSO ─────────────────────────────────────────────────
    const torso = new THREE.Group();
    torso.position.set(0, 0.36, 0);
    hips.add(torso);
    this.parts.torso = torso;

    torso.add(mk(cap(0.175, 0.42), shirt, 0, 0, 0));
    torso.add(mk(box(0.36, 0.46, 0.01), shirtD, 0, 0, 0.175));

    [-0.26, 0.26].forEach(x => {
      torso.add(mk(sph(0.085), shirt, x, 0.22, 0));
    });

    // ── HEAD ──────────────────────────────────────────────────
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.40, 0);
    torso.add(headGroup);
    this.parts.head = headGroup;

    headGroup.add(mk(sph(0.165), skin, 0, 0.05, 0));
    headGroup.add(mk(sph(0.168), hair, 0, 0.12, 0));
    headGroup.add(mk(box(0.34, 0.12, 0.20), hair, 0, 0.19, -0.04));
    
    [-0.062, 0.062].forEach(x => {
      headGroup.add(mk(sph(0.025), eye, x, 0.08, 0.152));
    });
    
    headGroup.add(mk(sph(0.022), skin, 0, 0.03, 0.162));
    headGroup.add(mk(box(0.20, 0.07, 0.04), beard, 0, -0.04, 0.148));
    headGroup.add(mk(box(0.10, 0.10, 0.04), beard, 0, -0.10, 0.140));
    headGroup.add(mk(box(0.14, 0.03, 0.03), beard, 0, 0.025, 0.158));

    // ── ARMS ──────────────────────────────────────────────────
    const lUA = new THREE.Group();
    lUA.position.set(-0.265, 0.20, 0);
    torso.add(lUA);
    this.parts.lUpperArm = lUA;
    lUA.add(mk(cap(0.06, 0.20), shirt, 0, -0.13, 0));

    const lFA = new THREE.Group();
    lFA.position.set(0, -0.30, 0);
    lUA.add(lFA);
    this.parts.lArm = lFA;
    lFA.add(mk(cap(0.052, 0.18), skin, 0, -0.10, 0));
    lFA.add(mk(sph(0.058), skin, 0, -0.22, 0));

    this.leftHand = new THREE.Group();
    this.leftHand.position.set(0, -0.24, 0);
    lFA.add(this.leftHand);

    const rUA = new THREE.Group();
    rUA.position.set(0.265, 0.20, 0);
    torso.add(rUA);
    this.parts.rUpperArm = rUA;
    rUA.add(mk(cap(0.06, 0.20), shirt, 0, -0.13, 0));

    const rFA = new THREE.Group();
    rFA.position.set(0, -0.30, 0);
    rUA.add(rFA);
    this.parts.rArm = rFA;
    rFA.add(mk(cap(0.052, 0.18), skin, 0, -0.10, 0));
    rFA.add(mk(sph(0.058), skin, 0, -0.22, 0));

    this.rightHand = new THREE.Group();
    this.rightHand.position.set(0, -0.24, 0);
    rFA.add(this.rightHand);

    // ── LEGS ──────────────────────────────────────────────────
    const lLeg = new THREE.Group();
    lLeg.position.set(-0.12, -0.11, 0);
    hips.add(lLeg);
    this.parts.lLeg = lLeg;
    lLeg.add(mk(cap(0.072, 0.34), pants, 0, -0.19, 0));
    lLeg.add(mk(box(0.13, 0.08, 0.24), boot, 0, -0.43, 0.04));

    const rLeg = new THREE.Group();
    rLeg.position.set(0.12, -0.11, 0);
    hips.add(rLeg);
    this.parts.rLeg = rLeg;
    rLeg.add(mk(cap(0.072, 0.34), pants, 0, -0.19, 0));
    rLeg.add(mk(box(0.13, 0.08, 0.24), boot, 0, -0.43, 0.04));

    console.log('[Villager] 3D character initialized');
  }

  _buildProps() {
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

    // Cleaning rag for motorcycle
    const ragGroup = new THREE.Group();
    const ragMat = new THREE.MeshStandardMaterial({ color: 0xddddaa, roughness: 0.95 });
    const ragBase = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.004, 0.08), ragMat);
    ragGroup.add(ragBase);
    const fold = new THREE.Mesh(
      new THREE.BoxGeometry(0.10, 0.005, 0.025),
      new THREE.MeshStandardMaterial({ color: 0xcccc88, roughness: 0.95 })
    );
    fold.position.z = 0.025;
    ragGroup.add(fold);
    ragGroup.visible = false;
    this.leftHand.add(ragGroup);
    this.propMeshes.rag = ragGroup;
  }

  _setMacroAction(action) {
    if (action === this.macroAction) return;
    this.macroAction      = action;
    this.microTasks       = [];
    this.microTimer       = 0;
    this.currentMicroTask = null;  // ← critical: reset active task
    this._setCarried(null);

    switch (action) {
      case 'watering_crops': {
        this.microTasks.push({type:'walk', pos:TOOL_LOCATIONS.watering_can});
        this.microTasks.push({type:'pickup', item:'watering_can', duration:1.0});
        PLANT_POSITIONS.forEach((p) => {
          this.microTasks.push({type:'walk',  pos:p});
          this.microTasks.push({type:'water', pos:p, duration:2.5});
        });
        this.microTasks.push({type:'walk', pos:TOOL_LOCATIONS.watering_can});
        this.microTasks.push({type:'putdown', item:'watering_can', duration:0.5});
        break;
      }
      case 'chopping_wood': {
        this.microTasks.push({type:'walk',   pos:TOOL_LOCATIONS.axe});
        this.microTasks.push({type:'pickup', item:'axe', duration:0.8});
        for (let i = 0; i < 6; i++) {
          const pos = CHOP_POSITIONS[i % CHOP_POSITIONS.length];
          this.microTasks.push({type:'walk', pos});
          this.microTasks.push({type:'chop', duration:3.0});
        }
        this.microTasks.push({type:'walk',    pos:TOOL_LOCATIONS.axe});
        this.microTasks.push({type:'putdown', item:'axe', duration:0.5});
        break;
      }
      case 'harvesting':
      case 'tending_crops': {
        PLANT_POSITIONS.slice(0,6).forEach((p) => {
          this.microTasks.push({type:'walk', pos:p});
          this.microTasks.push({type:'tend', duration:2.0});
        });
        break;
      }
      case 'checking_motorcycle': {
        this.microTasks.push({type:'walk',   pos:{x:4, z:-4}});
        this.microTasks.push({type:'pickup', item:'rag', duration:0.5});
        for (let i = 0; i < 4; i++) {
          this.microTasks.push({type:'wipe', duration:2.5});
        }
        this.microTasks.push({type:'putdown', item:'rag', duration:0.5});
        break;
      }
      case 'sleeping': {
        this.microTasks.push({type:'walk', pos: HOUSE_DOOR});
        this.microTasks.push({type:'walk', pos: INSIDE_BED});
        break;
      }
      case 'eating': {
        this.microTasks.push({type:'walk', pos: HOUSE_DOOR});
        this.microTasks.push({type:'walk', pos: INSIDE_TABLE});
        break;
      }
      case 'sitting': {
        this.microTasks.push({type:'walk', pos: HOUSE_DOOR});
        this.microTasks.push({type:'walk', pos: INSIDE_BED});
        this.microTasks.push({type:'sit_pose', duration: 1.0});
        break;
      }
    }
  }

  _setCarried(item) {
    this.carriedItem = item;
    Object.keys(this.propMeshes).forEach(k => {
      this.propMeshes[k].visible = (k === item);
    });
  }

  _nextMicroTask() {
    if (this.microTasks.length === 0) {
      this.currentMicroTask = null;
      return;
    }
    const task = this.microTasks.shift();
    this.currentMicroTask = task;
    this.microTimer = 0;
    if (task.type === 'walk') {
      this.targetPos.set(task.pos.x, 0, task.pos.z);
      this.microDuration = 999;
    } else {
      this.microDuration = task.duration || 2.0;
      if (task.type === 'pickup')  this._setCarried(task.item);
      if (task.type === 'putdown') this._setCarried(null);
    }
  }

  _resetPose() {
    const p = this.parts;
    Object.values(p).forEach(o => { if (o.rotation) o.rotation.set(0,0,0); });
    if (p.hips) p.hips.position.y = 0.75;
    // Always reset root to upright — sleeping/sitting sets it each frame
    this.root.rotation.x = 0;
    this.root.position.y = 0;
  }

  _animate(t, task) {
    const p = this.parts;
    this._resetPose();
    const micro = task?.type;
    const macro = this.macroAction;

    const isMoving = this.currentPos.distanceTo(this.targetPos) > 0.15;
    if (isMoving) {
      const spd = 5;
      const sw  = 0.45;
      if (p.lUpperArm) p.lUpperArm.rotation.x =  Math.sin(t*spd)*sw;
      if (p.rUpperArm) p.rUpperArm.rotation.x = -Math.sin(t*spd)*sw;
      if (p.lLeg)      p.lLeg.rotation.x = -Math.sin(t*spd)*0.55;
      if (p.rLeg)      p.rLeg.rotation.x =  Math.sin(t*spd)*0.55;
      if (p.hips)      p.hips.position.y = 0.75 + Math.abs(Math.sin(t*spd*2))*0.02;
      return;
    }

    switch (micro) {
      case 'water':
        if (p.lUpperArm) p.lUpperArm.rotation.x = -0.9 + Math.sin(t*2)*0.1;
        if (p.lArm)      p.lArm.rotation.x      = -0.4;
        break;
      case 'chop': {
        const chop = Math.sin(t*4);
        if (p.rUpperArm) p.rUpperArm.rotation.x = -1.2 + chop*0.8;
        break;
      }
      case 'tend':
        if (p.torso) p.torso.rotation.x = 0.4 + Math.sin(t*2)*0.1;
        break;
      case 'wipe': {
        // Wiping motion — left arm scrubs side to side, right steadies
        const sw = Math.sin(t * 7); // Faster scrub
        const scrub = Math.cos(t * 7);
        if (p.lUpperArm) p.lUpperArm.rotation.x = -0.9 + scrub * 0.2;
        if (p.lUpperArm) p.lUpperArm.rotation.z =  0.4 + sw * 0.4;
        if (p.lArm)      p.lArm.rotation.x      = -0.6 + sw * 0.3;
        if (p.rUpperArm) p.rUpperArm.rotation.x = -0.5;
        if (p.torso)     p.torso.rotation.y      =  sw * 0.12;
        break;
      }
      case 'sit_pose':
        if (p.lLeg) p.lLeg.rotation.x = 0.85;
        if (p.rLeg) p.rLeg.rotation.x = 0.85;
        if (p.hips) p.hips.position.y = 0.45;
        if (p.torso) p.torso.rotation.x = 0.1;
        break;
    }

    if (macro === 'sleeping') {
      // Force lying flat on back, head pointing towards -Z (pillow)
      this.root.rotation.set(-Math.PI/2, 0, 0);
      this.root.position.set(-2.5, 1.19, -8.5); // x: center, y: mattress+offset, z: foot of bed
    } else if (macro === 'sitting') {
      if (p.lLeg) p.lLeg.rotation.x = 1.2;
      if (p.rLeg) p.rLeg.rotation.x = 1.2;
      if (p.hips) p.hips.position.y = 0.35;
      if (p.torso) p.torso.rotation.x = 0.1;
      this.root.rotation.set(0, Math.PI/2, 0); // Face +X (towards room)
      this.root.position.set(-2.0, 0.70, -9.0); // Sit on the edge of the bed
    }
  }

  setState(data) {
    this.state = data;
    if (data.position_x !== undefined) {
      const x = data.position_x ?? 0;
      const z = data.position_z ?? 0;
      // Priority check: if he is doing a macro that requires indoor walking, don't let server-state override targetPos
      // until the micro-tasks (navigation to bed/table) are complete.
      const isIndoorMacro = ['sleeping', 'eating', 'sitting'].includes(data.current_action);
      const isExecutingPath = this.microTasks.length > 0 || this.currentMicroTask?.type === 'walk';

      if (!isIndoorMacro || !isExecutingPath) {
        if (this.microTasks.length === 0 && !this.currentMicroTask) {
          this.targetPos.set(x, 0, z);
        }
      }
      if (!this.initialized) {
        this.currentPos.set(x, 0, z);
        this.root.position.set(x, 0, z);
        this.initialized = true;
      }
    }
    this._setMacroAction(data.current_action || 'idle');
  }

  update(delta, elapsed) {
    this.animTime += delta;
    const t = this.animTime;

    if (this.currentMicroTask) {
      this.microTimer += delta;
      if (this.currentMicroTask.type === 'walk') {
        if (this.currentPos.distanceTo(this.targetPos) < 0.15) {
          this.currentMicroTask = null;
          this._nextMicroTask();
        }
      } else if (this.microTimer >= this.microDuration) {
        this.currentMicroTask = null;
        this._nextMicroTask();
      }
    } else if (this.microTasks.length > 0) {
      this._nextMicroTask();
    }

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

    this._animate(t, this.currentMicroTask);
  }
}
