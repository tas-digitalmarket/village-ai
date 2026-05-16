const {
  OPENROUTER_API_KEY,
  SAMBANOVA_API_KEY,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  SAMBANOVA_PRIMARY_MODEL,
  SAMBANOVA_FALLBACK_MODEL
} = require('./config');
const {
  getAidaState,
  saveAidaState,
  getAidaMemories,
  addAidaMemory,
  searchAidaMemories,
  getState,
  getPlan,
  savePlan,
  getGoals,
  getRelationship
} = require('./database');
const { createPlan, getNextPlanStep, markPlanStepDone, invalidatePlan } = require('./agent-planner');
const { decideNextAction } = require('./life-brain');
const {
  parseMinutes,
  absoluteMinute,
  ensureAidaMind,
  addShortMemory,
  applyAidaBodyNeeds,
  applyAidaWorldDrift,
  buildAidaRiskProfile,
  ensureAidaDailyPlan,
  chooseAidaGoalTask,
  applyAidaActionConsequences,
  buildAidaReflection,
  maybeCreateAidaWorldEvent,
  makeTask
} = require('./aida-life');

const AIDA_LOCATIONS = {
  home: { x: 18, z: 36 },
  home_bed: { x: 15.7, z: 34.6 },
  home_table: { x: 20.1, z: 35.1 },
  herb_workbench: { x: 20.6, z: 37.8 },
  garden: { x: 11, z: 44 },
  well: { x: 10.5, z: 40.5 },
  barn: { x: 26, z: 40.2 },
  field: { x: 24.5, z: 44.2 },
  village_square: { x: 31, z: 24 },
  prayer_house: { x: 37, z: 18.5 },
  arash_path: { x: 7, z: 16 }
};

const ROUTINE = [
  { from: 0, to: 6 * 60, action: 'sleeping', label: 'Sleeping in her home', location: 'home_bed', mood: 'tired', duration: 60 },
  { from: 6 * 60, to: 7 * 60, action: 'eating', label: 'Breakfast at her table', location: 'home_table', mood: 'peaceful', duration: 25 },
  { from: 7 * 60, to: 9 * 60, action: 'morning_garden', label: 'Morning garden care', location: 'garden', mood: 'focused', duration: 35 },
  { from: 9 * 60, to: 10 * 60 + 30, action: 'checking_herbs', label: 'Sorting herbs at her workbench', location: 'herb_workbench', mood: 'curious', duration: 35 },
  { from: 10 * 60 + 30, to: 12 * 60, action: 'village_errand', label: 'Walking to the village square', location: 'village_square', mood: 'content', duration: 35 },
  { from: 12 * 60, to: 13 * 60, action: 'eating', label: 'Lunch at home', location: 'home_table', mood: 'content', duration: 25 },
  { from: 13 * 60, to: 14 * 60, action: 'resting', label: 'Quiet rest inside her home', location: 'home', mood: 'peaceful', duration: 35 },
  { from: 14 * 60, to: 16 * 60, action: 'animal_care', label: 'Tending small animals', location: 'barn', mood: 'focused', duration: 35 },
  { from: 16 * 60, to: 17 * 60, action: 'watering_garden', label: 'Watering her field and garden', location: 'field', mood: 'focused', duration: 30 },
  { from: 17 * 60, to: 18 * 60 + 30, action: 'shared_path_garden', label: 'Shared path garden work with Arash', location: 'arash_path', mood: 'curious', duration: 35, source: 'social' },
  { from: 18 * 60 + 30, to: 19 * 60 + 30, action: 'eating', label: 'Simple dinner at home', location: 'home_table', mood: 'content', duration: 25 },
  { from: 19 * 60 + 30, to: 21 * 60, action: 'evening_prayer', label: 'Evening prayer and quiet thoughts', location: 'prayer_house', mood: 'peaceful', duration: 35 },
  { from: 21 * 60, to: 22 * 60, action: 'checking_herbs', label: 'Writing herb notes at home', location: 'herb_workbench', mood: 'curious', duration: 30 },
  { from: 22 * 60, to: 24 * 60, action: 'sleeping', label: 'Sleeping in her home', location: 'home_bed', mood: 'tired', duration: 60 }
];

const PROVIDERS = [
  {
    name: 'OpenRouter',
    key: OPENROUTER_API_KEY,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: [PRIMARY_MODEL, FALLBACK_MODEL],
    headers: {
      'HTTP-Referer': 'https://village-ai-g0xj.onrender.com',
      'X-Title': 'Village AI'
    }
  },
  {
    name: 'SambaNova',
    key: SAMBANOVA_API_KEY,
    endpoint: 'https://api.sambanova.ai/v1/chat/completions',
    models: [SAMBANOVA_PRIMARY_MODEL, SAMBANOVA_FALLBACK_MODEL],
    headers: {}
  }
].filter(p => p.key && p.key !== 'MISSING_KEY');

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function routineStep(minute) {
  return ROUTINE.find(item => minute >= item.from && minute < item.to) || ROUTINE[0];
}

function taskKey(day, task, minute) {
  // For planner/life_brain tasks, use step_id or action+location to ensure uniqueness per step
  if (task.source === 'planner' || task.source === 'life_brain') {
    return `${day}:${task.source}:${task.step_id || task.action}:${task.location || ''}`;
  }
  return `${day}:${task.source || 'routine'}:${task.goal_id || task.action}:${Math.floor(minute / Math.max(1, task.duration || 30))}`;
}

function startAidaTask(state, task, absMinute, worldTime) {
  const location = task.location || 'home';
  const pos = AIDA_LOCATIONS[location] || AIDA_LOCATIONS.home;
  return addShortMemory({
    ...state,
    current_action: task.action || 'resting',
    active_task_label: task.label || task.action || 'Aida task',
    active_task_source: task.source || 'routine',
    active_task_reason: task.reason || null,
    active_task_location: location,
    active_goal_id: task.goal_id || null,
    active_goal_title: task.goal_title || null,
    active_risk_id: task.risk_id || null,
    task_started_at_abs: absMinute,
    task_ends_at_abs: absMinute + Math.max(1, Number(task.duration || 30)),
    mood: task.mood || state.mood || 'focused',
    home_label: 'Aida homestead',
    position_x: pos.x,
    position_y: 0,
    position_z: pos.z
  }, `Aida started ${task.label || task.action}.`, worldTime);
}

function completeAidaTask(state, weather, worldTime) {
  const action = state.current_action;
  if (!action || action === 'idle') return { state, thought: null };
  const result = applyAidaActionConsequences(state, action, state.active_task_location, weather, worldTime);
  const label = state.active_task_label || action;
  const notes = result.outcome.notes.length ? ` (${result.outcome.notes.join(', ')})` : '';
  const thought = result.outcome.success
    ? `کار ${label} را تمام کردم و اثرش را در خانه و باغچه‌ام می‌بینم.`
    : `کار ${label} کامل پیش نرفت؛ باید بعدا دوباره به آن برگردم.`;

  // Mark the matching step done in Aida's active plan
  try {
    let currentPlan = getPlan('aida');
    if (currentPlan && currentPlan.status === 'active') {
      const step = currentPlan.steps.find(s => s.action === action && s.status === 'pending');
      if (step) {
        currentPlan = markPlanStepDone('aida', currentPlan, step.id);
        savePlan('aida', currentPlan);
      }
    }
  } catch (planErr) {
    console.error('[Planner:Aida] completeAidaTask plan update failed:', planErr.message);
  }

  addAidaMemory(`Aida completed ${label} at ${worldTime}.${notes}`, { type: action === 'shared_path_garden' ? 'social' : 'life', importance: result.outcome.success ? 6 : 7 });
  return {
    state: addShortMemory({
      ...result.state,
      current_action: 'idle',
      active_task_label: null,
      active_task_source: null,
      active_task_reason: null,
      active_task_location: null,
      active_goal_id: null,
      active_goal_title: null,
      active_risk_id: null,
      task_started_at_abs: null,
      task_ends_at_abs: null
    }, `Aida finished ${label}.`, worldTime),
    thought
  };
}

function chooseAidaTask(state, risk, minute) {
  const critical = risk.risks?.find(item => item.task && item.severity >= 88);
  if (critical) return { ...critical.task, risk_id: critical.id, source: 'risk' };
  const urgent = risk.risks?.find(item => item.task && item.severity >= 58);
  if (urgent) return { ...urgent.task, risk_id: urgent.id, source: urgent.task.source || 'need' };
  const goalTask = chooseAidaGoalTask(state, minute);
  if (goalTask) return goalTask;
  const routine = routineStep(minute);
  return { ...routine, source: routine.source || 'routine' };
}

async function updateAidaRoutine(worldTime, context = {}) {
  const day = context.day || getState().day || 1;
  const weather = context.weather || getState().weather || 'sunny';
  const minute = parseMinutes(worldTime);
  const abs = absoluteMinute(day, worldTime);
  let state = ensureAidaMind(getAidaState());
  let thought = null;

  state = { ...state, world_time: worldTime, day, home_label: 'Aida homestead' };
  state = applyAidaWorldDrift(state, weather);
  state = applyAidaBodyNeeds(state, weather);

  let risk = buildAidaRiskProfile(state, weather, minute);
  state = ensureAidaDailyPlan(state, risk, worldTime, day);

  if (state.current_action !== 'idle' && !state.task_ends_at_abs) {
    state = { ...state, current_action: 'idle', active_task_label: null, task_started_at_abs: null, task_ends_at_abs: null };
  }

  if (state.current_action !== 'idle' && state.task_ends_at_abs && abs >= Number(state.task_ends_at_abs)) {
    const completed = completeAidaTask(state, weather, worldTime);
    state = completed.state;
    thought = completed.thought;
  }

  risk = buildAidaRiskProfile(state, weather, minute);
  state = ensureAidaDailyPlan(state, risk, worldTime, day);

  if (minute >= 21 * 60 + 40) {
    const reflection = buildAidaReflection(state, risk, worldTime, day);
    if (reflection) {
      state = reflection.state;
      addAidaMemory(reflection.text, { type: 'reflection', importance: reflection.importance });
    }
  }

  const eventResult = maybeCreateAidaWorldEvent(state, risk, weather, worldTime, day);
  if (eventResult) {
    state = eventResult.state;
    addAidaMemory(`Aida world event: ${eventResult.event.title}. ${eventResult.event.note}`, { type: 'world', importance: eventResult.event.severity >= 70 ? 8 : 5 });
    thought = thought || eventResult.event.note;
  }

  if (state.current_action === 'idle') {
    // Priority: Critical risk -> Planner step -> Create plan -> Life Brain -> Goal task -> Routine
    const critical = risk.risks?.find(item => item.task && item.severity >= 88);
    let task = null;
    
    if (critical) {
      task = { ...critical.task, risk_id: critical.id, source: 'risk' };
    }

    if (!task) {
      let currentPlan = getPlan('aida');
      
      if (currentPlan && currentPlan.status === 'active') {
        const step = getNextPlanStep('aida', currentPlan);
        if (step) {
          task = {
            source: 'planner',
            step_id: step.id,
            label: step.action,
            action: step.action,
            location: step.location,
            duration: 28,
            reason: step.reason,
            goal_id: currentPlan.active_goal,
            goal_title: currentPlan.active_goal
          };
        }
      }

      const lastPlannerCall = Number(state.last_aida_planner_call_abs || 0);
      const shouldCallPlanner = !task && (!currentPlan || currentPlan.status !== 'active' || (abs - lastPlannerCall >= 20));

      if (shouldCallPlanner) {
        const goals = getGoals('aida');
        const memories = getAidaMemories(5);
        const relationships = getRelationship('arash_aida');
        try {
          currentPlan = await createPlan('aida', state, state.aida_world || {}, memories, relationships, goals, []);
          savePlan('aida', currentPlan);
          state.last_aida_planner_call_abs = abs;
          const step = getNextPlanStep('aida', currentPlan);
          if (step) {
            task = {
              source: 'planner',
              step_id: step.id,
              label: step.action,
              action: step.action,
              location: step.location,
              duration: 28,
              reason: step.reason,
              goal_id: currentPlan.active_goal,
              goal_title: currentPlan.active_goal
            };
            // log moved to createPlan() inside agent-planner.js
          }
        } catch (planErr) {
          console.error('[Planner:Aida] createPlan failed:', planErr.message);
        }
      }

      if (!task) {
        try {
          const goals = getGoals('aida');
          const memories = getAidaMemories(5);
          const relationships = getRelationship('arash_aida');
          const lifeDecision = await decideNextAction('aida', state, state.aida_world || {}, memories, relationships, [], goals);
          task = {
            source: 'life_brain',
            label: lifeDecision.action,
            action: lifeDecision.action,
            location: lifeDecision.location,
            duration: lifeDecision.duration,
            reason: lifeDecision.reason,
            goal_id: lifeDecision.goal,
            thought_override: lifeDecision.thought
          };
          console.log(`[LifeBrain:Aida] chose ${lifeDecision.action} at ${lifeDecision.location}`);
        } catch (lbErr) {
          console.error('[LifeBrain:Aida] failed:', lbErr.message);
        }
      }

      if (!task) {
        // Fallback: goal task or routine
        const goalTask = chooseAidaGoalTask(state, minute);
        const urgent = risk.risks?.find(item => item.task && item.severity >= 58);
        task = goalTask || (urgent ? { ...urgent.task, risk_id: urgent.id, source: urgent.task.source || 'need' } : null) || { ...routineStep(minute), source: 'routine' };
      }
    }

    if (task) {
      const key = taskKey(day, task, minute);
      const isNewTask = state.last_aida_task_key !== key || task.source !== 'routine';
      if (isNewTask) {
        state = startAidaTask({ ...state, last_aida_task_key: key }, task, abs, worldTime);
        thought = thought || task.thought_override || (task.action === 'shared_path_garden'
          ? 'امروز کنار مسیر خاکی با آرش کمی کار مشترک می‌کنم.'
          : `${task.label || task.action} را شروع می‌کنم.`);
        addAidaMemory(`Aida started ${task.label || task.action} at ${worldTime}.${task.reason ? ` Reason: ${task.reason}.` : ''}`, {
          type: task.action === 'shared_path_garden' ? 'social' : 'life',
          importance: task.source === 'risk' ? 8 : 5
        });
      }
    }
  }

  risk = buildAidaRiskProfile(state, weather, minute);
  state = {
    ...state,
    risk_state: risk,
    visible_feedback: buildAidaVisibleFeedback(state, risk, thought),
    thought: thought || state.thought || null
  };
  saveAidaState(state);
  return state;
}

function buildAidaVisibleFeedback(state, risk, thought) {
  const world = state.aida_world || {};
  return {
    headline: state.active_task_label || 'Watching her homestead',
    body: thought || state.active_task_reason || risk?.summary || 'Aida is reading the needs of her home and garden.',
    garden: world.garden,
    animals: world.animals,
    home: world.home
  };
}

function buildAidaSocialDialogue(arashState = getState(), aidaState = getAidaState(), worldTime = arashState.world_time || '06:00') {
  const minute = parseMinutes(worldTime);
  const arashAction = arashState.active_task_label || arashState.current_action || 'کارهای مزرعه';
  const aidaAction = aidaState.active_task_label || aidaState.current_action || 'کارهای خانه';
  const sharedWork = aidaState.current_action === 'shared_path_garden' || (minute >= 17 * 60 && minute < 18 * 60 + 30);
  const morningWindow = minute >= 7 * 60 && minute < 9 * 60;
  const nightWindow = minute >= 22 * 60 || minute < 6 * 60;

  if (nightWindow) {
    return [
      { speaker: 'arash', text: 'شب شده؛ باید انرژی‌ام را برای فردا نگه دارم.' },
      { speaker: 'aida', text: 'من هم در خانه‌ام آرام می‌خوابم؛ فردا باغچه کار دارد.' }
    ];
  }
  if (sharedWork) {
    return [
      { speaker: 'arash', text: 'این مسیر بین خانه‌ها اگر مرتب بماند، رفت‌وآمدمان راحت‌تر می‌شود.' },
      { speaker: 'aida', text: 'درست می‌گویی؛ من کنار راه چند بوته هم می‌کارم تا اینجا زنده‌تر شود.' }
    ];
  }
  if (morningWindow) {
    return [
      { speaker: 'arash', text: `صبح را با ${arashAction} شروع کرده‌ام.` },
      { speaker: 'aida', text: 'من هم به باغچه‌ام سر می‌زنم؛ گیاه‌ها صبح را دوست دارند.' }
    ];
  }
  return [
    { speaker: 'arash', text: `فعلا مشغول ${arashAction} هستم.` },
    { speaker: 'aida', text: `من هم ${aidaAction} را انجام می‌دهم.` }
  ];
}

function extractJSON(text) {
  const stripped = String(text || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in Aida response');
  return JSON.parse(match[0]);
}

async function callProvider(provider, model, messages) {
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.key}`,
      'Content-Type': 'application/json',
      ...provider.headers
    },
    body: JSON.stringify({ model, messages, temperature: 0.55, top_p: 0.86, max_tokens: 700 })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function fallbackReply(message, state, arashState, memories) {
  const text = String(message || '').toLowerCase();
  if (/سلام|درود|hello|hi/.test(text)) return 'سلام خالق. من آیدا هستم؛ در خانه جنوبی روستا زندگی می‌کنم و روزم بین باغچه، گیاهان و حیوانات می‌گذرد.';
  if (/تو کیستی|کی هستی|who are you/.test(text)) return 'من آیدا هستم؛ زنی از همین روستا که بیشتر با باغچه، گیاهان و مراقبت از جانوران سر و کار دارد.';
  if (/آرش|arash/.test(text)) return 'آرش را می‌شناسم و حس می‌کنم همسایه مهمی برای این روستا می‌شود. فعلا رابطه‌مان آرام و تازه است.';
  if (/کجا هستی|where are you/.test(text)) return `الان نزدیک ${state.active_task_label || 'خانه‌ام'} هستم و روزم را آرام جلو می‌برم.`;
  const memory = memories?.[0]?.content;
  return memory ? `شنیدم. این را کنار چیزهایی که برایم مهم است نگه می‌دارم؛ مثل این خاطره: ${memory}` : 'شنیدم. با دقت به حرفت فکر می‌کنم و می‌گذارم روی تصمیم‌ها و زندگی‌ام اثر بگذارد.';
}

async function processAidaMessage(message) {
  const state = ensureAidaMind(getAidaState());
  const arashState = getState();
  const recent = getAidaMemories(6);
  const relevant = searchAidaMemories(message, 6, { types: ['creator', 'social', 'life'] });
  const relation = state.relationship_arash || 28;

  const systemPrompt = `You are Aida, an ordinary human villager living in her own homestead near Arash.\n\nIdentity:\n- Name: Aida\n- Role: herbalist, gardener, and animal keeper\n- Home: Aida homestead, the southern homestead connected to the village square by a dirt road\n- Personality: observant, warm but not overly submissive, thoughtful, practical, quietly curious\n- Creator relationship: the Creator brought this world into being and may speak with you directly\n- Arash relationship: Arash is a nearby farmer. Your relationship is still new and should evolve slowly through shared memories and future interactions. Current closeness: ${relation}/100\n\nCurrent state:\n- Mood: ${state.mood || 'curious'}\n- Current activity: ${state.active_task_label || state.current_action || 'settling into village life'}\n- Main risk: ${state.risk_state?.summary || 'none'}\n- Aida home: ${state.home_label || 'Aida homestead'}\n- Arash current activity: ${arashState.current_action || 'idle'}\n\nRecent memories:\n${recent.map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No recent memories.'}\n\nRelevant memories:\n${relevant.map((m, i) => `${i + 1}. ${m.content}`).join('\n') || 'No strongly relevant memory.'}\n\nAnswer in natural Persian. Do not mention percentages, JSON, model names, or internal systems unless directly asked.\nReturn raw JSON only with this shape:\n{\n  "aida_response": "one or two warm natural Persian sentences",\n  "memory": "short memory worth keeping",\n  "relationship_delta": 0\n}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Creator says: ${message}` }
  ];

  for (const provider of PROVIDERS) {
    for (const model of provider.models.filter(Boolean)) {
      try {
        const parsed = extractJSON(await callProvider(provider, model, messages));
        const response = String(parsed.aida_response || '').trim() || fallbackReply(message, state, arashState, relevant);
        const delta = clamp(Number(parsed.relationship_delta || 0), -3, 3);
        const next = addShortMemory({ ...state, relationship_arash: clamp((state.relationship_arash || 28) + delta, 0, 100) }, `Creator said: ${String(message || '').slice(0, 100)}`, state.world_time);
        saveAidaState(next);
        if (parsed.memory) addAidaMemory(parsed.memory, { type: /آرش|arash/.test(parsed.memory) ? 'social' : 'creator', importance: 7 });
        return { aida_response: response, state: next };
      } catch (err) {
        console.error(`[Aida:${provider.name}] ${model} failed:`, String(err.message || err).slice(0, 180));
      }
    }
  }

  const fallback = fallbackReply(message, state, arashState, relevant);
  const next = addShortMemory(state, `Creator spoke with Aida: ${String(message || '').slice(0, 100)}`, state.world_time);
  saveAidaState(next);
  addAidaMemory(`Creator spoke with Aida: ${String(message || '').slice(0, 120)}`, { type: 'creator', importance: 6 });
  return { aida_response: fallback, state: next };
}

module.exports = { updateAidaRoutine, processAidaMessage, buildAidaSocialDialogue, AIDA_LOCATIONS };
