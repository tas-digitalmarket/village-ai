function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function isOutsideAction(action) {
  return ['walking', 'chopping_wood', 'watering_crops', 'harvesting', 'running_to_shelter', 'fishing', 'tending_animals', 'checking_motorcycle', 'wandering', 'tending_crops'].includes(action);
}

function makeTask(label, action, location, duration, reason, priority = 70) {
  return { label, action, location, duration, source: 'need', priority, reason };
}

function fieldEntries(world = {}) {
  return [
    { key: 'east', location: 'east_field', field: world.fields?.east || {} },
    { key: 'west', location: 'west_field', field: world.fields?.west || {} }
  ];
}

function chooseField(world, predicate, sorter) {
  const entries = fieldEntries(world).filter(({ field }) => predicate(field));
  if (!entries.length) return null;
  entries.sort(sorter || ((a, b) => (b.field.growth || 0) - (a.field.growth || 0)));
  return entries[0];
}

function projectedMoisture(field = {}, weather = 'sunny', worldMinutes = 180) {
  const driftSteps = Math.max(1, Math.ceil(worldMinutes / 30));
  const weatherDelta = weather === 'rainy' ? 14 : weather === 'stormy' ? 18 : weather === 'sunny' || weather === 'windy' ? -5 : -3;
  return clamp((field.moisture || 0) + weatherDelta * driftSteps);
}

function buildRiskProfile(state = {}, world = {}, weather = 'sunny', minute = 360) {
  const risks = [];
  const energy = Number(state.energy ?? 80);
  const hunger = Number(state.hunger ?? 20);
  const action = state.current_action || 'idle';
  const outside = isOutsideAction(action);
  const food = Number(world.storage?.food ?? 0);
  const well = Number(world.well?.water_level ?? 0);
  const activeMinutes = state.task_started_at_abs && state.task_ends_at_abs
    ? Math.max(0, Number(state.task_ends_at_abs) - Number(state.task_started_at_abs))
    : 0;

  function add(id, label, severity, reason, task = null) {
    risks.push({ id, label, severity: clamp(severity), reason, task });
  }

  if (energy <= 10) add('collapse_risk', 'Collapse risk', 100, 'energy is dangerously low', makeTask('Emergency Sleep', 'sleeping', 'bed', 90, 'energy is dangerously low', 100));
  else if (energy <= 22) add('exhaustion', 'Exhaustion', 86, 'energy is low enough to slow work', makeTask('Recover Energy', 'sitting', 'bed', 35, 'energy is getting low', 86));
  else if (activeMinutes >= 45 && energy <= 38) add('overwork', 'Overwork', 72, 'he has been working too long while tired', makeTask('Short Rest', 'sitting', 'bed', 25, 'work is becoming tiring', 72));

  if (hunger >= 94 && food > 0) add('starvation_pressure', 'Starvation pressure', 98, 'hunger is critical', makeTask('Eat Before Weakness', 'eating', 'table', 20, 'hunger is critical', 98));
  else if (hunger >= 80 && food > 0) add('hunger_pressure', 'Hunger pressure', 82, 'hunger will soon affect energy', makeTask('Eat Something', 'eating', 'table', 20, 'hunger is high', 82));
  else if (hunger >= 70 && food <= 2) add('food_insecurity', 'Food insecurity', 80, 'hunger is rising while food is low', makeTask('Find Food', 'fishing', 'fishing_spot', 35, 'food is low and hunger is rising', 80));

  if ((weather === 'rainy' || weather === 'stormy') && outside) {
    add('exposure', 'Weather exposure', weather === 'stormy' ? 92 : 72, 'bad weather makes outside work risky', makeTask('Take Shelter', 'running_to_shelter', 'home', 12, 'bad weather outside', weather === 'stormy' ? 92 : 72));
  }
  if (weather === 'sunny' && minute >= 12 * 60 && minute <= 16 * 60 && outside && energy < 45) {
    add('heat_fatigue', 'Heat fatigue', 76, 'midday heat is draining energy', makeTask('Cool Down Indoors', 'sitting', 'home', 25, 'midday heat is tiring', 76));
  }

  const drySoon = chooseField(
    world,
    f => projectedMoisture(f, weather, 180) <= 20 && (f.health || 0) > 35,
    (a, b) => projectedMoisture(a.field, weather, 180) - projectedMoisture(b.field, weather, 180)
  );
  const dryNow = chooseField(
    world,
    f => (f.moisture || 0) <= 18,
    (a, b) => (a.field.moisture || 0) - (b.field.moisture || 0)
  );
  const readyField = chooseField(world, f => (f.growth || 0) >= 85);
  const weakField = chooseField(world, f => (f.health || 0) <= 45);

  if (dryNow && well > 8) add('field_dry', 'Field drying out', 86, `${dryNow.field.label || dryNow.key} is already too dry`, makeTask('Water Dry Field', 'watering_crops', dryNow.location, 30, 'a field is too dry', 86));
  else if (drySoon && well > 12 && weather !== 'rainy' && weather !== 'stormy') add('field_dry_soon', 'Field will dry soon', 68, `${drySoon.field.label || drySoon.key} is likely to dry soon`, makeTask('Prevent Field Dryness', 'watering_crops', drySoon.location, 25, 'a field will dry soon', 68));

  if (readyField && food <= 3) add('food_reserve_low', 'Food reserve low', 88, 'food is low and crops are ready', makeTask('Harvest Food Reserve', 'harvesting', readyField.location, 40, 'food is low and crops are ready', 88));
  else if (readyField) add('crop_overripe_risk', 'Crops ready', 74, 'ready crops should not wait too long', makeTask('Harvest Ready Crops', 'harvesting', readyField.location, 40, 'crops are ready', 74));

  if (weakField) add('crop_health_risk', 'Crop health risk', 78, `${weakField.field.label || weakField.key} is weak`, makeTask('Tend Weak Crops', 'tending_crops', weakField.location, 30, 'crop health is weak', 78));
  if (well <= 15) add('well_low', 'Well nearly dry', 72, 'water reserve is low', null);

  if ((world.animals?.hunger ?? 0) >= 82) add('animal_hunger', 'Animal hunger', 82, 'animals are getting too hungry', makeTask('Feed Animals', 'tending_animals', 'fence_north', 25, 'animals are hungry', 82));
  if ((world.animals?.health ?? 100) <= 45) add('animal_health', 'Animal health risk', 84, 'animals need care', makeTask('Care For Animals', 'tending_animals', 'fence_north', 30, 'animals need care', 84));
  if ((world.house?.cleanliness ?? 100) <= 24) add('dirty_house', 'Dirty house', 62, 'the house is becoming unhealthy', makeTask('Clean The House', 'sitting', 'home', 25, 'house is getting dirty', 62));
  if ((world.house?.condition ?? 100) <= 45 && (world.storage?.wood ?? 0) > 1) add('house_damage', 'House damage', 76, 'the house needs repair before it worsens', makeTask('Repair House', 'chopping_wood', 'home', 35, 'house needs repairs', 76));
  if ((world.motorcycle?.condition ?? 100) <= 35) add('motorcycle_damage', 'Motorcycle damage', 58, 'the motorcycle is becoming unreliable', makeTask('Repair Motorcycle', 'checking_motorcycle', 'motorcycle', 25, 'motorcycle condition is poor', 58));

  risks.sort((a, b) => b.severity - a.severity);
  const topRisk = risks[0] || null;
  const overall = topRisk ? topRisk.severity : 0;
  const mode = overall >= 90 ? 'critical' : overall >= 75 ? 'urgent' : overall >= 55 ? 'watching' : 'stable';

  return {
    overall,
    mode,
    topRisk,
    risks: risks.slice(0, 8),
    summary: topRisk ? `${topRisk.label}: ${topRisk.reason}` : 'No major risk is active.'
  };
}

function chooseRiskTask(state, world, weather, minute, criticalOnly = false) {
  const profile = buildRiskProfile(state, world, weather, minute);
  const threshold = criticalOnly ? 90 : 58;
  const risk = profile.risks.find(item => item.task && item.severity >= threshold);
  if (!risk) return null;
  return {
    ...risk.task,
    priority: Math.max(risk.task.priority || 0, risk.severity),
    risk_id: risk.id,
    risk_severity: risk.severity,
    reason: risk.reason
  };
}

module.exports = {
  buildRiskProfile,
  chooseRiskTask,
  projectedMoisture
};
