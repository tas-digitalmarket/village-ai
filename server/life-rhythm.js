function parseWorldMinutes(time) {
  const [h = 0, m = 0] = String(time || '06:00').split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function isOutdoorAction(action) {
  return [
    'walking', 'chopping_wood', 'watering_crops', 'harvesting', 'running_to_shelter',
    'fishing', 'tending_animals', 'checking_motorcycle', 'wandering', 'tending_crops',
    'morning_garden', 'watering_garden', 'animal_care', 'neighbor_walk',
    'village_errand', 'shared_path_garden'
  ].includes(action);
}

function homeLocation(characterName, kind = 'home') {
  if (characterName === 'aida') {
    if (kind === 'bed') return 'home_bed';
    if (kind === 'table') return 'home_table';
    return 'home';
  }
  if (kind === 'bed') return 'bed';
  if (kind === 'table') return 'table';
  return 'home';
}

function ruralRhythmPhase(time) {
  const minute = parseWorldMinutes(time);
  if (minute < 6 * 60) return 'deep_night';
  if (minute < 8 * 60) return 'wake_and_breakfast';
  if (minute < 11 * 60 + 30) return 'morning_work';
  if (minute < 13 * 60) return 'midday_meal';
  if (minute < 14 * 60 + 30) return 'midday_rest';
  if (minute < 17 * 60 + 30) return 'afternoon_work';
  if (minute < 20 * 60) return 'evening_meal_social';
  if (minute < 22 * 60) return 'quiet_evening';
  return 'night_sleep';
}

function buildRuralRhythmContext(characterName, state = {}, worldState = {}, weather = 'sunny') {
  const time = state.world_time || '06:00';
  const phase = ruralRhythmPhase(time);
  const energy = Number(state.energy ?? 80);
  const hunger = Number(state.hunger ?? 20);
  const storm = weather === 'stormy' || weather === 'rainy';
  const name = characterName === 'aida' ? 'Aida' : 'Arash';
  const home = characterName === 'aida' ? 'her homestead' : 'his farm house';
  const farmWork = characterName === 'aida'
    ? 'garden, herbs, animals, village errands, and careful neighbor contact'
    : 'fields, animals, wood, repairs, water, food storage, and cautious neighbor contact';

  const rules = [
    `${name} is an ordinary rural human, not a game bot. Decisions should feel like a lived day.`,
    `Current rhythm phase: ${phase}.`,
    'Normal day rhythm: sleep at night, wake slowly, eat in the morning, work in the cool morning, eat/rest around noon, do lighter afternoon work, eat and calm down in the evening.',
    `Core work domains: ${farmWork}.`,
    `Respect body signals: hunger ${hunger}/100, energy ${energy}/100. Very low energy or high hunger overrides plans.`,
    `Bad weather means ${name} prefers shelter or indoor work unless there is a serious reason.`,
    'If there is no meaningful work, it is okay to be idle, rest, observe, or do small home tasks.'
  ];

  return {
    phase,
    summary: rules.join('\n- '),
    shouldSleep: phase === 'deep_night' || phase === 'night_sleep' || energy <= 12,
    shouldEat: hunger >= 82 || ((phase === 'wake_and_breakfast' || phase === 'midday_meal' || phase === 'evening_meal_social') && hunger >= 38),
    shouldRest: phase === 'midday_rest' || energy <= 28,
    stormShelter: storm,
    home
  };
}

function rhythmTask(characterName, kind, reason) {
  if (kind === 'sleep') return { action: 'sleeping', location: homeLocation(characterName, 'bed'), reason };
  if (kind === 'eat') return { action: 'eating', location: homeLocation(characterName, 'table'), reason };
  if (kind === 'rest') return { action: characterName === 'aida' ? 'resting' : 'sitting', location: homeLocation(characterName), reason };
  if (kind === 'shelter') return { action: characterName === 'aida' ? 'resting' : 'running_to_shelter', location: homeLocation(characterName), reason };
  return null;
}

function fitDecisionToRuralRhythm(characterName, decision = {}, state = {}, worldState = {}, weather = 'sunny') {
  const rhythm = buildRuralRhythmContext(characterName, state, worldState, weather);
  let override = null;

  if (rhythm.shouldSleep && decision.action !== 'sleeping') {
    override = rhythmTask(characterName, 'sleep', 'rural rhythm: night or exhaustion comes before optional work');
  } else if (rhythm.stormShelter && isOutdoorAction(decision.action) && Number(state.energy ?? 80) < 45) {
    override = rhythmTask(characterName, 'shelter', 'rural rhythm: bad weather and low energy call for shelter');
  } else if (rhythm.shouldEat && decision.action !== 'eating') {
    override = rhythmTask(characterName, 'eat', 'rural rhythm: meal time or hunger comes before new work');
  } else if (rhythm.shouldRest && isOutdoorAction(decision.action) && Number(state.energy ?? 80) < 55) {
    override = rhythmTask(characterName, 'rest', 'rural rhythm: midday/low energy favors rest before more outdoor work');
  }

  if (!override) return { ...decision, rhythm_phase: rhythm.phase };
  return {
    ...decision,
    action: override.action,
    location: override.location,
    reason: override.reason,
    thought: decision.thought || (characterName === 'aida'
      ? 'الان باید ریتم بدن و خانه ام را جدی بگیرم.'
      : 'الان باید مثل یک روز عادی روستایی به بدن و خانه ام گوش بدهم.'),
    rhythm_phase: rhythm.phase,
    rhythm_adjusted: true
  };
}

function fitPlanToRuralRhythm(characterName, plan = {}, state = {}, worldState = {}, weather = 'sunny') {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) return plan;
  const first = plan.steps[0];
  const fitted = fitDecisionToRuralRhythm(characterName, first, state, worldState, weather);
  if (!fitted.rhythm_adjusted) return { ...plan, rhythm_phase: fitted.rhythm_phase };
  const steps = [
    {
      ...first,
      action: fitted.action,
      location: fitted.location,
      reason: fitted.reason,
      expected_result: 'Keeps the day believable and protects basic human rhythm.'
    },
    ...plan.steps.slice(1)
  ];
  return {
    ...plan,
    steps,
    plan_reason: `${plan.plan_reason || 'Plan'} | adjusted for rural daily rhythm`,
    rhythm_phase: fitted.rhythm_phase,
    rhythm_adjusted: true
  };
}

module.exports = {
  parseWorldMinutes,
  ruralRhythmPhase,
  buildRuralRhythmContext,
  fitDecisionToRuralRhythm,
  fitPlanToRuralRhythm,
  isOutdoorAction
};
