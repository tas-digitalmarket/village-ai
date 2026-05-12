const fs = require('fs');
const path = require('path');

const RENDER_DATA_DIR = '/data/village';
const DATA_DIR = process.env.DATA_DIR ||
  (process.env.RENDER && fs.existsSync('/data') ? RENDER_DATA_DIR : path.join(__dirname, '../data'));
const WORLD_FILE = path.join(DATA_DIR, 'world-state.json');

const DEFAULT_WORLD_STATE = {
  fields: {
    east: { label: 'East Field', moisture: 52, growth: 42, health: 86 },
    west: { label: 'West Field', moisture: 46, growth: 25, health: 82 }
  },
  well: { water_level: 78 },
  storage: { food: 12, wood: 8, seeds: 24 },
  house: { condition: 92, cleanliness: 70 },
  motorcycle: { condition: 68, fuel: 45 },
  animals: { hunger: 38, health: 88, produce: 0 },
  alerts: [],
  updated_at: new Date().toISOString()
};

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampCount(value, min = 0, max = 999) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function mergeField(base, value) {
  return {
    label: value?.label || base.label,
    moisture: clamp(value?.moisture ?? base.moisture),
    growth: clamp(value?.growth ?? base.growth),
    health: clamp(value?.health ?? base.health)
  };
}

function normalizeWorldState(input = {}) {
  return {
    fields: {
      east: mergeField(DEFAULT_WORLD_STATE.fields.east, input.fields?.east),
      west: mergeField(DEFAULT_WORLD_STATE.fields.west, input.fields?.west)
    },
    well: { water_level: clamp(input.well?.water_level ?? DEFAULT_WORLD_STATE.well.water_level) },
    storage: {
      food: clampCount(input.storage?.food ?? DEFAULT_WORLD_STATE.storage.food),
      wood: clampCount(input.storage?.wood ?? DEFAULT_WORLD_STATE.storage.wood),
      seeds: clampCount(input.storage?.seeds ?? DEFAULT_WORLD_STATE.storage.seeds)
    },
    house: {
      condition: clamp(input.house?.condition ?? DEFAULT_WORLD_STATE.house.condition),
      cleanliness: clamp(input.house?.cleanliness ?? DEFAULT_WORLD_STATE.house.cleanliness)
    },
    motorcycle: {
      condition: clamp(input.motorcycle?.condition ?? DEFAULT_WORLD_STATE.motorcycle.condition),
      fuel: clamp(input.motorcycle?.fuel ?? DEFAULT_WORLD_STATE.motorcycle.fuel)
    },
    animals: {
      hunger: clamp(input.animals?.hunger ?? DEFAULT_WORLD_STATE.animals.hunger),
      health: clamp(input.animals?.health ?? DEFAULT_WORLD_STATE.animals.health),
      produce: clampCount(input.animals?.produce ?? DEFAULT_WORLD_STATE.animals.produce)
    },
    alerts: Array.isArray(input.alerts) ? input.alerts.slice(-8) : [],
    updated_at: input.updated_at || new Date().toISOString()
  };
}

function readWorldState() {
  ensureDataDir();
  if (!fs.existsSync(WORLD_FILE)) {
    const initial = normalizeWorldState(DEFAULT_WORLD_STATE);
    writeWorldState(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
    const normalized = normalizeWorldState(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) writeWorldState(normalized);
    return normalized;
  } catch (err) {
    console.warn('[World] Failed to read world state, using defaults:', err.message);
    const initial = normalizeWorldState(DEFAULT_WORLD_STATE);
    writeWorldState(initial);
    return initial;
  }
}

function writeWorldState(worldState) {
  ensureDataDir();
  const normalized = normalizeWorldState({ ...worldState, updated_at: new Date().toISOString() });
  fs.writeFileSync(WORLD_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

function fieldKeyForLocation(location) {
  if (location === 'west_field') return 'west';
  return 'east';
}

function driftField(field, weather) {
  let moisture = field.moisture;
  let growth = field.growth;
  let health = field.health;

  if (weather === 'rainy') moisture += 14;
  else if (weather === 'stormy') moisture += 18;
  else if (weather === 'sunny' || weather === 'windy') moisture -= 5;
  else moisture -= 3;

  if (moisture > 35 && health > 45) growth += moisture > 65 ? 3 : 2;
  else if (moisture > 20 && health > 35) growth += 1;

  if (moisture < 12) health -= 6;
  else if (moisture < 22) health -= 3;
  else if (moisture > 45 && health < 95) health += 1;

  if (growth > 92 && moisture < 30) health -= 2;

  return { ...field, moisture: clamp(moisture), growth: clamp(growth), health: clamp(health) };
}

function buildAlerts(world) {
  const alerts = [];
  if (world.storage.food <= 2) alerts.push('Food is critically low.');
  if (world.well.water_level <= 15) alerts.push('The well is nearly dry.');
  if (world.house.cleanliness <= 25) alerts.push('The house is getting dirty.');
  if (world.house.condition <= 45) alerts.push('The house needs repairs.');
  if (world.animals.hunger >= 78) alerts.push('Animals are hungry.');
  if (world.animals.health <= 45) alerts.push('Animals need care.');
  if (world.motorcycle.condition <= 35) alerts.push('The motorcycle needs repair.');
  if (world.fields.east.moisture <= 18 || world.fields.west.moisture <= 18) alerts.push('A field is getting too dry.');
  if (world.fields.east.health <= 45 || world.fields.west.health <= 45) alerts.push('A field is becoming weak.');
  if (world.fields.east.growth >= 85 || world.fields.west.growth >= 85) alerts.push('Some crops are ready to harvest.');
  return alerts;
}

function applyActionConsequences(currentWorld, decision = {}, weather = 'sunny') {
  const next = normalizeWorldState(currentWorld);
  const action = decision.action || '';
  const location = decision.target_location || decision.location || '';
  const fieldKey = fieldKeyForLocation(location);
  const field = next.fields[fieldKey];
  const outcome = { action, success: true, notes: [] };

  if (action === 'watering_crops') {
    const waterUse = weather === 'rainy' || weather === 'stormy' ? 4 : 10;
    if (next.well.water_level >= waterUse) {
      field.moisture = clamp(field.moisture + (weather === 'sunny' ? 34 : 24));
      field.health = clamp(field.health + 3);
      next.well.water_level = clamp(next.well.water_level - waterUse);
      outcome.notes.push('field watered');
    } else {
      field.health = clamp(field.health - 3);
      outcome.success = false;
      outcome.notes.push('not enough well water');
    }
  }

  if (action === 'tending_crops') {
    field.health = clamp(field.health + 14);
    field.growth = clamp(field.growth + (field.moisture > 25 ? 4 : 1));
    field.moisture = clamp(field.moisture - 4);
    if (next.storage.seeds > 0 && field.growth < 25) {
      next.storage.seeds -= 1;
      field.growth = clamp(field.growth + 8);
      outcome.notes.push('reseeded weak rows');
    }
    outcome.notes.push('crop health improved');
  }

  if (action === 'harvesting') {
    const readiness = field.growth;
    const healthFactor = field.health >= 70 ? 1 : field.health >= 45 ? 0.7 : 0.45;
    const baseYield = readiness >= 90 ? 11 : readiness >= 75 ? 8 : readiness >= 55 ? 4 : 1;
    const yieldAmount = Math.max(1, Math.round(baseYield * healthFactor));
    next.storage.food += yieldAmount;
    next.storage.seeds += readiness >= 75 ? 3 : 1;
    field.growth = readiness >= 70 ? 8 : clamp(readiness - 22);
    field.health = clamp(field.health - (readiness >= 70 ? 2 : 5));
    outcome.notes.push(`harvested ${yieldAmount} food`);
    if (readiness < 55) outcome.notes.push('early harvest was weak');
  }

  if (action === 'chopping_wood') {
    const woodGain = weather === 'stormy' ? 2 : weather === 'rainy' ? 3 : 5;
    next.storage.wood += woodGain;
    next.motorcycle.fuel = clamp(next.motorcycle.fuel - 1);
    outcome.notes.push(`collected ${woodGain} wood`);
  }

  if (action === 'eating') {
    if (next.storage.food > 0) {
      next.storage.food -= 1;
      next.house.cleanliness = clamp(next.house.cleanliness - 1);
      outcome.notes.push('used one food');
    } else {
      next.house.cleanliness = clamp(next.house.cleanliness - 2);
      outcome.success = false;
      outcome.notes.push('no food available');
    }
  }

  if (action === 'tending_animals') {
    if (next.storage.food > 0) {
      next.storage.food -= 1;
      next.animals.hunger = clamp(next.animals.hunger - 34);
      next.animals.health = clamp(next.animals.health + 10);
      outcome.notes.push('fed animals');
    } else {
      next.animals.hunger = clamp(next.animals.hunger - 8);
      next.animals.health = clamp(next.animals.health + 2);
      outcome.success = false;
      outcome.notes.push('comforted animals without feed');
    }
  }

  if (action === 'checking_motorcycle') {
    const hasWood = next.storage.wood > 0;
    next.motorcycle.condition = clamp(next.motorcycle.condition + (hasWood ? 14 : 6));
    next.motorcycle.fuel = clamp(next.motorcycle.fuel - 1);
    if (hasWood) next.storage.wood -= 1;
    outcome.notes.push(hasWood ? 'used wood for repairs' : 'minor repair without parts');
  }

  if (action === 'fishing') {
    const catchAmount = weather === 'stormy' ? 1 : weather === 'rainy' ? 4 : 3;
    next.storage.food += catchAmount;
    outcome.notes.push(`caught ${catchAmount} food`);
  }

  if (action === 'sleeping') {
    next.house.cleanliness = clamp(next.house.cleanliness - 1);
    outcome.notes.push('rested in bed');
  }

  if (action === 'sitting') {
    next.house.cleanliness = clamp(next.house.cleanliness + 5);
    outcome.notes.push('house became tidier');
  }

  if (action === 'wandering') {
    if (weather === 'stormy' || weather === 'rainy') next.house.cleanliness = clamp(next.house.cleanliness - 1);
    outcome.notes.push('checked the farm paths');
  }

  if (action === 'running_to_shelter') {
    next.house.cleanliness = clamp(next.house.cleanliness - 1);
    outcome.notes.push('reached shelter');
  }

  next.alerts = buildAlerts(next);
  next.updated_at = new Date().toISOString();
  return { worldState: writeWorldState(next), outcome };
}

function applyWorldDrift(currentWorld, weather = 'sunny') {
  const world = normalizeWorldState(currentWorld);
  const next = normalizeWorldState({
    ...world,
    fields: {
      east: driftField(world.fields.east, weather),
      west: driftField(world.fields.west, weather)
    },
    well: { water_level: world.well.water_level + (weather === 'rainy' ? 5 : weather === 'stormy' ? 8 : -1) },
    storage: { ...world.storage },
    house: {
      condition: world.house.condition + (weather === 'stormy' ? -2 : 0),
      cleanliness: world.house.cleanliness - 1
    },
    motorcycle: {
      condition: world.motorcycle.condition - (weather === 'stormy' ? 1 : 0),
      fuel: world.motorcycle.fuel
    },
    animals: {
      hunger: world.animals.hunger + 4,
      health: world.animals.health + (world.animals.hunger > 82 ? -4 : world.animals.hunger > 65 ? -1 : 1),
      produce: world.animals.produce + (world.animals.hunger < 60 && world.animals.health > 60 ? 1 : 0)
    }
  });

  next.alerts = buildAlerts(next);
  next.updated_at = new Date().toISOString();
  return writeWorldState(next);
}

function updateWorldStateForTick(currentWorld, decision = {}, weather = 'sunny') {
  const drifted = applyWorldDrift(currentWorld, weather);
  const { worldState } = applyActionConsequences(drifted, decision, weather);
  return worldState;
}

function summarizeWorldState(worldState) {
  const world = normalizeWorldState(worldState);
  return [
    `East Field: moisture ${world.fields.east.moisture}%, growth ${world.fields.east.growth}%, health ${world.fields.east.health}%`,
    `West Field: moisture ${world.fields.west.moisture}%, growth ${world.fields.west.growth}%, health ${world.fields.west.health}%`,
    `Storage: food ${world.storage.food}, wood ${world.storage.wood}, seeds ${world.storage.seeds}`,
    `Well: water ${world.well.water_level}%`,
    `House: condition ${world.house.condition}%, cleanliness ${world.house.cleanliness}%`,
    `Motorcycle: condition ${world.motorcycle.condition}%, fuel ${world.motorcycle.fuel}%`,
    `Animals: hunger ${world.animals.hunger}%, health ${world.animals.health}%, produce ${world.animals.produce}`,
    `Alerts: ${world.alerts.length ? world.alerts.join(' | ') : 'none'}`
  ].join('\n');
}

module.exports = {
  readWorldState,
  writeWorldState,
  updateWorldStateForTick,
  applyWorldDrift,
  applyActionConsequences,
  summarizeWorldState
};
