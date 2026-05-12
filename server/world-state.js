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
      food: Math.max(0, Math.round(Number(input.storage?.food ?? DEFAULT_WORLD_STATE.storage.food))),
      wood: Math.max(0, Math.round(Number(input.storage?.wood ?? DEFAULT_WORLD_STATE.storage.wood))),
      seeds: Math.max(0, Math.round(Number(input.storage?.seeds ?? DEFAULT_WORLD_STATE.storage.seeds)))
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
      produce: Math.max(0, Math.round(Number(input.animals?.produce ?? DEFAULT_WORLD_STATE.animals.produce)))
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
  if (world.fields.east.moisture <= 18 || world.fields.west.moisture <= 18) alerts.push('A field is getting too dry.');
  if (world.fields.east.growth >= 85 || world.fields.west.growth >= 85) alerts.push('Some crops are ready to harvest.');
  return alerts;
}

function updateWorldStateForTick(currentWorld, decision = {}, weather = 'sunny') {
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
    motorcycle: { ...world.motorcycle },
    animals: {
      hunger: world.animals.hunger + 4,
      health: world.animals.health + (world.animals.hunger > 82 ? -4 : world.animals.hunger > 65 ? -1 : 1),
      produce: world.animals.produce + (world.animals.hunger < 60 && world.animals.health > 60 ? 1 : 0)
    }
  });

  const action = decision.action || '';
  const location = decision.target_location || '';
  const fieldKey = fieldKeyForLocation(location);
  const field = next.fields[fieldKey];

  if (action === 'watering_crops') {
    if (next.well.water_level > 5) {
      field.moisture = clamp(field.moisture + 30);
      field.health = clamp(field.health + 2);
      next.well.water_level = clamp(next.well.water_level - 8);
    } else {
      field.health = clamp(field.health - 2);
    }
  }

  if (action === 'tending_crops') {
    field.health = clamp(field.health + 12);
    field.growth = clamp(field.growth + 2);
    field.moisture = clamp(field.moisture - 3);
  }

  if (action === 'harvesting') {
    const yieldAmount = field.growth >= 75 ? 9 : field.growth >= 45 ? 3 : 1;
    next.storage.food += yieldAmount;
    next.storage.seeds += field.growth >= 75 ? 3 : 1;
    field.growth = field.growth >= 75 ? 10 : clamp(field.growth - 18);
    field.health = clamp(field.health - 2);
  }

  if (action === 'chopping_wood') next.storage.wood += 5;

  if (action === 'eating') {
    if (next.storage.food > 0) next.storage.food -= 1;
    else next.house.cleanliness = clamp(next.house.cleanliness - 1);
  }

  if (action === 'tending_animals') {
    next.animals.hunger = clamp(next.animals.hunger - 28);
    next.animals.health = clamp(next.animals.health + 8);
    if (next.storage.food > 0) next.storage.food -= 1;
  }

  if (action === 'checking_motorcycle') {
    next.motorcycle.condition = clamp(next.motorcycle.condition + 9);
    next.motorcycle.fuel = clamp(next.motorcycle.fuel - 1);
  }

  if (action === 'sleeping') next.house.cleanliness = clamp(next.house.cleanliness - 1);
  if (action === 'sitting') next.house.cleanliness = clamp(next.house.cleanliness + 2);

  next.alerts = buildAlerts(next);
  next.updated_at = new Date().toISOString();
  return writeWorldState(next);
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
  summarizeWorldState
};
