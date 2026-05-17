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
  canCallPlanner,
  canCallLifeBrain,
  markCompletedTempo,
  makeSettleTask,
  rememberLifeBrainCall
} = require('./decision-tempo');
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
    // Store step_id so completeAidaTask can mark the exact step done
    active_plan_step_id: task.source === 'planner' ? (task.step_id || null) : null,
    task_started_at_abs: absMinute,
    task_ends_at_abs: absMinute + Math.max(1, Number(task.duration || 30)),
    mood: task.mood || state.mood || 'focused',
    home_label: 'Aida homestead',
    position_x: pos.x,
    position_y: 0,
    position_z: pos.z
  }, `Aida started ${task.label || task.action}.`, worldTime);
}

function completeAidaTask(state, weather, worldTime, absMinute) {
  const action = state.current_action;
  const location = state.active_task_location || 'home';
  if (!action || action === 'idle') return { state, thought: null };
  const result = applyAidaActionConsequences(state, action, location, weather, worldTime);
  const label = state.active_task_label || action;
  const notes = result.outcome.notes.length ? ` (${result.outcome.notes.join(', ')})` : '';
  const thought = result.outcome.success
    ? `Ú©Ø§Ø± ${label} Ø±Ø§ ØªÙ…Ø§Ù… Ú©Ø±Ø¯Ù… Ùˆ Ø§Ø«Ø±Ø´ Ø±Ø§ Ø¯Ø± Ø®Ø§Ù†Ù‡ Ùˆ Ø¨Ø§ØºÚ†Ù‡â€ŒØ§Ù… Ù…ÛŒâ€ŒØ¨ÛŒÙ†Ù….`
    : `Ú©Ø§Ø± ${label} Ú©Ø§Ù…Ù„ Ù¾ÛŒØ´ Ù†Ø±ÙØªØ› Ø¨Ø§ÛŒØ¯ Ø¨Ø¹Ø¯Ø§ Ø¯ÙˆØ¨Ø§Ø±Ù‡ Ø¨Ù‡ Ø¢Ù† Ø¨Ø±Ú¯Ø±Ø¯Ù….`;

  // Mark the exact plan step done in Aida's active plan
  try {
    let currentPlan = getPlan('aida');
    if (currentPlan && currentPlan.status === 'active') {
      const stepId = state.active_plan_step_id;
      let matchedStep = null;

      if (stepId) {
        // Preferred: match by stored step_id
        matchedStep = currentPlan.steps.find(s => s.id === stepId && s.status === 'pending');
        if (matchedStep) console.log(`[Planner:Aida] completed step by ID: ${stepId}`);
      }

      if (!matchedStep) {
        // Fallback: action + location
        matchedStep = currentPlan.steps.find(
          s => s.action === action && s.location === location && s.status === 'pending'
        );
        if (matchedStep) console.log(`[Planner:Aida] completed step by action+location: ${action}@${location}`);
      }

      if (!matchedStep) {
        // Last resort: action only
        matchedStep = currentPlan.steps.find(s => s.action === action && s.status === 'pending');
        if (matchedStep) console.log(`[Planner:Aida] completed step by action only (fallback): ${action}`);
      }

      if (matchedStep) {
        currentPlan = markPlanStepDone('aida', currentPlan, matchedStep.id);
        savePlan('aida', currentPlan);
      }
    }
  } catch (planErr) {
    console.error('[Planner:Aida] completeAidaTask plan update failed:', planErr.message);
  }

  addAidaMemory(`Aida completed ${label} at ${worldTime}.${notes}`, { type: action === 'shared_path_garden' ? 'social' : 'life', importance: result.outcome.success ? 6 : 7 });
  return {
    state: markCompletedTempo(addShortMemory({
      ...result.state,
      current_action: 'idle',
      active_task_label: null,
      active_task_source: null,
      active_task_reason: null,
      active_task_location: null,
      active_goal_id: null,
      active_goal_title: null,
      active_risk_id: null,
      active_plan_step_id: null,
      task_started_at_abs: null,
      task_ends_at_abs: null
    }, `Aida finished ${label}.`, worldTime), absMinute, label, state.active_task_source),
    thought
  };
}

function chooseAidaTask(state, risk, minute) {
  const critical = risk.risks?.find(item => item.task && item.severity >= 88);
  if (critical) reurn { ...critical.task, risk_id: critical.id, source: 'risk' };
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
    const completed = completeAidaTask(state, weather, worldTime, abs);
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
    const routine = routineStep(minute);
    const urgent = risk.risks?.find(item => item.task && item.severity >= 58);
    const goalTask = chooseAidaGoalTask(state, minute);
    let task = null;
    
    if (critical) {
      task = { ...critical.task, risk_id: critical.id, source: 'risk' };
    }

    if (!task) {
      task = (urgent ? { ...urgent.task, risk_id: urgent.id, source: urgent.task.source || 'need' } : null)
        || goalTask
        || makeSettleTask('aida', state, abs, worldTime);
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
      const shouldCallPlanner = !task
        && (!currentPlan || currentPlan.status !== 'active' || (abs - lastPlannerCall >= 20))
        && canCallPlanner(state, abs, worldTime);

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

      if (!task && canCallLifeBrain(state, abs, worldTime)) {
        try {
          const goals = getGoals('aida');
          const memories = getAidaMemories(5);
          const relationships = getRelationship('arash_aida');
          const lifeDecision = await decideNextAction('aida', state, state.aida_world || {}, memories, relationships, [], goals);
          state = rememberLifeBrainCall(state, 'aida', abs);
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
        task = makeSettleTask('aida', state, abs, worldTime) || { ...routine, source: routine.source || 'routine' };
      }
    }

Yˆ
\ÚÊHÂˆÛÛœİÙ^HH\ÚÒÙ^J^K\ÚËZ[]JNÂˆÛÛœİ\Ó™]Õ\ÚÈHİ]K›\İØZYWİ\Ú×ÚÙ^HOOHÙ^H\ÚËœÛİ\˜ÙHOOH	Ü›İ][™IÎÂˆYˆ
\Ó™]Õ\ÚÊHÂˆİ]HHİ\ZYU\ÚÊÈ‹‹œİ]K\İØZYWİ\Ú×ÚÙ^NˆÙ^HK\ÚËXœËÛÜ›[YJNÂˆİYÚHİYÚ\ÚËİYÚÛİ™\œšYH
\ÚË˜Xİ[ÛˆOOH	ÜÚ\™YÜ]ÙØ\™[‰ÂˆÈ	ö)öav,vb6,ˆ6ªva¶)ö,H6av,öã6,H6+¶)öªvã6*6)È6(¶,v-6ªvavã6ªv)ö,H6av-6*¶,vªH6avã8 #6ªva¶aK‰Âˆˆ	İ\ÚË›X™[\ÚË˜Xİ[ÛŸH6,v)È6-6,vb6.H6avã8 #6ªva¶aK˜
NÂˆYZYSY[[ÜJZYHİ\Y	İ\ÚË›X™[\ÚË˜Xİ[ÛŸH]	İÛÜ›[Y_K‰İ\ÚËœ™X\ÛÛˆÈ™X\ÛÛˆ	İ\ÚËœ™X\ÛÛŸK˜ˆ	ÉßXÂˆ\Nˆ\ÚË˜Xİ[ÛˆOOH	ÜÚ\™YÜ]ÙØ\™[‰ÈÈ	ÜÛØÚX[	Èˆ	ÛY™IËˆ[\Ü[˜ÙNˆ\ÚËœÛİ\˜ÙHOOH	Üš\ÚÉÈÈˆBˆJNÂˆBˆBˆB‚ˆš\ÚÈHZ[ZYTš\ÚÔ›Ùš[Jİ]KÙX]\‹Z[]JNÂˆİ]HHÂˆ‹‹œİ]Kˆš\Ú×Üİ]Nˆš\ÚËˆš\ÚX›WÙ™YY˜XÚÎˆZ[ZYUš\ÚX›Q™YY˜XÚÊİ]Kš\ÚËİYÚ
KˆİYÚˆİYÚİ]KİYÚ[ˆNÂˆØ]™PZYTİ]Jİ]JNÂˆ™]\›ˆİ]NÂŸB‚™[˜İ[ÛˆZ[ZYUš\ÚX›Q™YY˜XÚÊİ]Kš\ÚËİYÚ
HÂˆÛÛœİÛÜ›Hİ]K˜ZYWİÛÜ›ßNÂˆ™]\›ˆÂˆXY[™Nˆİ]K˜Xİ]™Wİ\Ú×ÛX™[	ÕØ]Ú[™È\ˆÛY\İXY	Ëˆ›ÙNˆİYÚİ]K˜Xİ]™Wİ\Ú×Ü™X\ÛÛˆš\ÚÏËœİ[[X\H	ĞZYH\È™XY[™ÈH™YYÈÙˆ\ˆÛYH[™Ø\™[‹‰ËˆØ\™[ˆÛÜ›™Ø\™[‹ˆ[š[X[ÎˆÛÜ›˜[š[X[ËˆÛYNˆÛÜ›šÛYBˆNÂŸB‚™[˜İ[ÛˆZ[ZYTÛØÚX[X[ÙİYJ\˜\Úİ]HHÙ]İ]J
KZYTİ]HHÙ]ZYTİ]J
KÛÜ›[YHH\˜\Úİ]KÛÜ›İ[YH	ÌŒ	ÊHÂˆÛÛœİZ[]HH\œÙSZ[]\ÊÛÜ›[YJNÂˆÛÛœİ\˜\ÚXİ[ÛˆH\˜\Úİ]K˜Xİ]™Wİ\Ú×ÛX™[\˜\Úİ]K˜İ\œ™[ØXİ[Ûˆ	öªv)ö,vaö)öã6av,¶,v.vaÉÎÂˆÛÛœİZYPXİ[ÛˆHZYTİ]K˜Xİ]™Wİ\Ú×ÛX™[ZYTİ]K˜İ\œ™[ØXİ[Ûˆ	öªv)ö,vaö)öã6+¶)öa¶aÉÎÂˆÛÛœİÚ\™YÛÜšÈHZYTİ]K˜İ\œ™[ØXİ[ÛˆOOH	ÜÚ\™YÜ]ÙØ\™[‰È
Z[]HHMÈ
ˆŒ	‰ˆZ[]HN
ˆŒ
ÈÌ
NÂˆÛÛœİ[Ü›š[™ÕÚ[™İÈHZ[]HHÈ
ˆŒ	‰ˆZ[]HH
ˆŒÂˆÛÛœİšYÚÚ[™İÈHZ[]HHŒˆ
ˆŒZ[]Hˆ
ˆŒÂ‚ˆYˆ
šYÚÚ[™İÊHÂˆ™]\›ˆÂˆÈÜXZÙ\ˆ	Ø\˜\Ú	Ë^ˆ	ö-6*6-6+öaö&È6*6)öã6+È6)öa¶,v¦6ã8 #6)öaH6,v)È6*6,v)öã6`v,v+ö)È6a¶«öaÈ6+ö)ö,vaK‰ÈKˆÈÜXZÙ\ˆ	ØZYIË^ˆ	öavaH6aöaH6+ö,H6+¶)öa¶aø #6)öaH6(¶,v)öaH6avã8 #6+¶b6)ö*6av&È6`v,v+ö)È6*6)ö.¶¡¶aÈ6ªv)ö,H6+ö)ö,v+Ë‰ÈBˆNÂˆBˆYˆ
Ú\™YÛÜšÊHÂˆ™]\›ˆÂˆÈÜXZÙ\ˆ	Ø\˜\Ú	Ë^ˆ	ö)öã6aˆ6av,öã6,H6*6ã6aˆ6+¶)öa¶aø #6aö)È6)ö«ö,H6av,v*¶*6*6av)öa¶+ö#6,v`v*¸ #6b6(¶av+öav)öaH6,v)ö+v*¸ #6*¶,H6avã8 #6-6b6+Ë‰ÈKˆÈÜXZÙ\ˆ	ØZYIË^ˆ	ö+ö,v,ö*ˆ6avã8 #6«öb6ã6ã6&È6avaH6ªva¶)ö,H6,v)öaÈ6¡¶a¶+È6*6b6*¶aÈ6aöaH6avã8 #6ªv)ö,vaH6*¶)È6)öã6a¶+6)È6,¶a¶+öaø #6*¶,H6-6b6+Ë‰ÈBˆNÂˆBˆYˆ
[Ü›š[™ÕÚ[™İÊHÂˆ™]\›ˆÂˆÈÜXZÙ\ˆ	Ø\˜\Ú	Ë^ˆ6-v*6+H6,v)È6*6)È	Ø\˜\ÚXİ[ÛŸH6-6,vb6.H6ªv,v+öaø #6)öaK˜KˆÈÜXZÙ\ˆ	ØZYIË^ˆ	öavaˆ6aöaH6*6aÈ6*6)ö.¶¡¶aø #6)öaH6,ö,H6avã8 #6,¶a¶av&È6«öã6)öaø #6aö)È6-v*6+H6,v)È6+öb6,ö*ˆ6+ö)ö,va¶+Ë‰ÈBˆNÂˆBˆ™]\›ˆÂˆÈÜXZÙ\ˆ	Ø\˜\Ú	Ë^ˆ6`v.va6)È6av-6.¶b6a	Ø\˜\ÚXİ[ÛŸH6aö,ö*¶aK˜KˆÈÜXZÙ\ˆ	ØZYIË^ˆ6avaH6aöaH	ØZYPXİ[ÛŸH6,v)È6)öa¶+6)öaH6avã8 #6+öaöaK˜BˆNÂŸB‚™[˜İ[Ûˆ^˜Xİ”ÓÓŠ^
HÂˆÛÛœİİš\YHİš[™Ê^	ÉÊKœ™\XÙJØ
ÎšœÛÛŠOËÙÚK	ÉÊKœ™\XÙJØÙË	ÉÊKš[J
NÂˆÛÛœİX]ÚHİš\Y›X]Ú
×Ö×××J—KÊNÂˆYˆ
[X]Ú
H›İÈ™]È\œ›ÜŠ	Ó›È”ÓÓˆØš™Xİ[ˆZYH™\ÜÛœÙIÊNÂˆ™]\›ˆ”ÓÓ‹œ\œÙJX]ÚÌJNÂŸB‚˜\Ş[˜È[˜İ[ÛˆØ[›İšY\Š›İšY\‹[Ù[Y\ÜØYÙ\ÊHÂˆÛÛœİ™\ÜÛœÙHH]ØZ]™]Ú
›İšY\‹™[™Ú[ÂˆY]Ùˆ	ÔÔÕ	ËˆXY\œÎˆÂˆ]]Üš^˜][Ûˆ™X\™\ˆ	Ü›İšY\‹šÙ^_Xˆ	ĞÛÛ[U\IÎˆ	Ø\XØ][Û‹ÚœÛÛ‰Ëˆ‹‹œ›İšY\‹šXY\œÂˆKˆ›ÙNˆ”ÓÓ‹œİš[™ÚYJÈ[Ù[Y\ÜØYÙ\Ë[\\˜]\™NˆMKÜÜˆ‹X^İÚÙ[œÎˆÌJBˆJNÂˆYˆ
\™\ÜÛœÙK›ÚÊH›İÈ™]È\œ›ÜŠ	Ü™\ÜÛœÙKœİ]\ßNˆ	Ø]ØZ]™\ÜÛœÙK^

_X
NÂˆÛÛœİ]HH]ØZ]™\ÜÛœÙKšœÛÛŠ
NÂˆ™]\›ˆ]K˜ÚÚXÙ\ÏË–ÌOË›Y\ÜØYÙOË˜ÛÛ[	ÉÎÂŸB‚™[˜İ[Ûˆ˜[˜XÚÔ™\JY\ÜØYÙKİ]K\˜\Úİ]KY[[ÜšY\ÊHÂˆÛÛœİ^Hİš[™ÊY\ÜØYÙH	ÉÊKÓİÙ\Ø\ÙJ
NÂˆYˆ
ö,öa6)öa_6+ö,vb6+ß[ßKË\İ
^
JH™]\›ˆ	ö,öa6)öaH6+¶)öa6`‹ˆ6avaH6(¶ã6+ö)È6aö,ö*¶av&È6+ö,H6+¶)öa¶aÈ6+6a¶b6*6ã6,vb6,ö*¶)È6,¶a¶+ö«öã6avã8 #6ªva¶aH6b6,vb6,¶fH6*6ã6aˆ6*6)ö.¶¡¶aö#6«öã6)öaö)öaH6b6+vã6b6)öa¶)ö*ˆ6avã8 #6«ö,6,v+Ë‰ÎÂˆYˆ
ö*¶b6ªvã6,ö*¶ã6ªvã6aö,ö*¶ãÚÈ\™H[İKË\İ
^
JH™]\›ˆ	öavaˆ6(¶ã6+ö)È6aö,ö*¶av&È6,¶a¶ã6)ö,ˆ6aöavã6aˆ6,vb6,ö*¶)È6ªvaÈ6*6ã6-6*¶,H6*6)È6*6)ö.¶¡¶aö#6«öã6)öaö)öaˆ6b6av,v)ö`¶*6*ˆ6)ö,ˆ6+6)öa¶b6,v)öaˆ6,ö,H6b6ªv)ö,H6+ö)ö,v+Ë‰ÎÂˆYˆ
ö(¶,v-\˜\ÚË\İ
^
JH™]\›ˆ	ö(¶,v-6,v)È6avã8 #6-6a¶)ö,öaH6b6+v,È6avã8 #6ªva¶aH6aöav,ö)öã6aÈ6avaöavã6*6,v)öá,H6)öã6aˆ6,vb6,ö*ˆ6avã8 #6-6b6+Ëˆ6`v.va6*6,v)ö*6-öaø #6av)öaˆ6(¶,v)öaH6b6*¶)ö,¶aÈ6)ö,ö*‹‰ÎÂˆYˆ
öªv+6)È6aö,ö*¶ãÚ\™H\™H[İKË\İ
^
JH™]\›ˆ6)öa6)öaH6a¶,¶+öã6ªH	Üİ]K˜Xİ]™Wİ\Ú×ÛX™[	ö+¶)öa¶aø #6)öaIßH6aö,ö*¶aH6b6,vb6,¶aH6,v)È6(¶,v)öaH6+6a6b6avã8 #6*6,vaK˜ÂˆÛÛœİY[[ÜHHY[[ÜšY\ÏË–ÌOË˜ÛÛ[Âˆ™]\›ˆY[[ÜHÈ6-6a¶ã6+öaKˆ6)öã6aˆ6,v)È6ªva¶)ö,H6¡¶ã6,¶aö)öã6ã6ªvaÈ6*6,v)öã6aH6avaöaH6)ö,ö*ˆ6a¶«öaÈ6avã8 #6+ö)ö,vav&È6av*öa6)öã6aˆ6+¶)ö-ö,vaÎˆ	ÛY[[Ü_Xˆ	ö-6a¶ã6+öaKˆ6*6)È6+ö`¶*ˆ6*6aÈ6+v,v`v*ˆ6`vªv,H6avã8 #6ªva¶aH6b6avã8 #6«ö,6)ö,vaH6,vb6ã6*¶-vavã6ax #6aö)È6b6,¶a¶+ö«öã8 #6)öaH6)ö*ö,H6*6«ö,6)ö,v+Ë‰ÎÂŸB‚˜\Ş[˜È[˜İ[Ûˆ›ØÙ\ÜĞZYSY\ÜØYÙJY\ÜØYÙJHÂˆÛÛœİİ]HH[œİ\™PZYSZ[™
Ù]ZYTİ]J
JNÂˆÛÛœİ\˜\Úİ]HHÙ]İ]J
NÂˆÛÛœİ™XÙ[HÙ]ZYSY[[ÜšY\ÊŠNÂˆÛÛœİ™[]˜[HÙX\˜ÚZYSY[[ÜšY\ÊY\ÜØYÙK‹È\\ÎˆÉØÜ™X]Ü‰Ë	ÜÛØÚX[	Ë	ÛY™I×HJNÂˆÛÛœİ™[][ÛˆHİ]Kœ™[][ÛœÚ\Ø\˜\ÚÂ‚ˆÛÛœİŞ\İ[T›Û\H[İH\™HZYK[ˆÜ™[˜\H[X[ˆš[YÙ\ˆ]š[™È[ˆ\ˆİÛˆÛY\İXY™X\ˆ\˜\Ú——’Y[]N—‹H˜[YNˆZYW‹H›ÛNˆ\˜˜[\İØ\™[™\‹[™[š[X[ÙY\\—‹HÛYNˆZYHÛY\İXYHÛİ]\›ˆÛY\İXYÛÛ›™XİYÈHš[YÙHÜ]X\™HHH\›ØY‹H\œÛÛ˜[]NˆØœÙ\˜[Ø\›H]›İİ™\›HİX›Z\ÜÚ]™KİYÚ[˜XİXØ[]ZY]Hİ\š[İ\×‹HÜ™X]Üˆ™[][ÛœÚ\ˆHÜ™X]Üˆœ›İYÚ\ÈÛÜ›[È™Z[™È[™X^HÜXZÈÚ][İH\™XİW‹H\˜\Ú™[][ÛœÚ\ˆ\˜\Ú\ÈH™X\˜H˜\›Y\‹ˆ[İ\ˆ™[][ÛœÚ\\Èİ[™]È[™Úİ[]›Û™HÛİÛH›İYÚÚ\™YY[[ÜšY\È[™]\™H[\˜Xİ[ÛœËˆİ\œ™[ÛÜÙ[™\ÜÎˆ	Ü™[][ÛŸKÌL—İ\œ™[İ]N—‹H[ÛÙˆ	Üİ]K›[ÛÙ	Øİ\š[İ\ÉßW‹Hİ\œ™[Xİ]š]Nˆ	Üİ]K˜Xİ]™Wİ\Ú×ÛX™[İ]K˜İ\œ™[ØXİ[Ûˆ	ÜÙ][™È[Èš[YÙHY™IßW‹HXZ[ˆš\ÚÎˆ	Üİ]Kœš\Ú×Üİ]OËœİ[[X\H	Û›Û™IßW‹HZYHÛYNˆ	Üİ]KšÛYWÛX™[	ĞZYHÛY\İXY	ßW‹H\˜\Úİ\œ™[Xİ]š]Nˆ	Ø\˜\Úİ]K˜İ\œ™[ØXİ[Ûˆ	ÚYIßW—”™XÙ[Y[[ÜšY\Î—‰Ü™XÙ[›X\

KJHOˆ	ÚH
È_Kˆ	ÛK˜ÛÛ[X
Kš›Ú[Š	×‰ÊH	Ó›È™XÙ[Y[[ÜšY\Ë‰ßW—”™[]˜[Y[[ÜšY\Î—‰Ü™[]˜[›X\

KJHOˆ	ÚH
È_Kˆ	ÛK˜ÛÛ[X
Kš›Ú[Š	×‰ÊH	Ó›Èİ›Û™ÛH™[]˜[Y[[ÜK‰ßW—[œİÙ\ˆ[ˆ˜]\˜[\œÚX[‹ˆÈ›İY[[Ûˆ\˜Ù[YÙ\Ë”ÓÓ‹[Ù[˜[Y\ËÜˆ[\›˜[Ş\İ[\È[›\ÜÈ\™XİH\ÚÙY—”™]\›ˆ˜]È”ÓÓˆÛ›HÚ]\ÈÚ\N—×ˆ˜ZYWÜ™\ÜÛœÙHˆ›Û™HÜˆÛÈØ\›H˜]\˜[\œÚX[ˆÙ[[˜Ù\È‹ˆ›Y[[ÜHˆœÚÜY[[ÜHÛÜÙY\[™È‹ˆœ™[][ÛœÚ\Ù[HˆŸXÂ‚ˆÛÛœİY\ÜØYÙ\ÈHÂˆÈ›ÛNˆ	ÜŞ\İ[IËÛÛ[ˆŞ\İ[T›Û\KˆÈ›ÛNˆ	İ\Ù\‰ËÛÛ[ˆÜ™X]ÜˆØ^\Îˆ	ÛY\ÜØYÙ_XBˆNÂ‚ˆ›Üˆ
ÛÛœİ›İšY\ˆÙˆ“Õ’QT”ÊHÂˆ›Üˆ
ÛÛœİ[Ù[Ùˆ›İšY\‹›[Ù[Ë™š[\Š›ÛÛX[ŠJHÂˆHÂˆÛÛœİ\œÙYH^˜Xİ”ÓÓŠ]ØZ]Ø[›İšY\Š›İšY\‹[Ù[Y\ÜØYÙ\ÊJNÂˆÛÛœİ™\ÜÛœÙHHİš[™Ê\œÙY˜ZYWÜ™\ÜÛœÙH	ÉÊKš[J
H˜[˜XÚÔ™\JY\ÜØYÙKİ]K\˜\Úİ]K™[]˜[
NÂˆÛÛœİ[HHÛ[\
[X™\Š\œÙYœ™[][ÛœÚ\Ù[H
KLËÊNÂˆÛÛœİ™^HYÚÜY[[ÜJÈ‹‹œİ]K™[][ÛœÚ\Ø\˜\ÚˆÛ[\

İ]Kœ™[][ÛœÚ\Ø\˜\Ú
H
È[KL
HKÜ™X]ÜˆØZYˆ	Ôİš[™ÊY\ÜØYÙH	ÉÊKœÛXÙJL
_Xİ]KÛÜ›İ[YJNÂˆØ]™PZYTİ]J™^
NÂˆYˆ
\œÙY›Y[[ÜJHYZYSY[[ÜJ\œÙY›Y[[ÜKÈ\Nˆö(¶,v-\˜\ÚË\İ
\œÙY›Y[[ÜJHÈ	ÜÛØÚX[	Èˆ	ØÜ™X]Ü‰Ë[\Ü[˜ÙNˆÈJNÂˆ™]\›ˆÈZYWÜ™\ÜÛœÙNˆ™\ÜÛœÙKİ]Nˆ™^NÂˆHØ]Ú
\œŠHÂˆÛÛœÛÛK™\œ›ÜŠĞZYN‰Ü›İšY\‹›˜[Y_WH	Û[Ù[H˜Z[Y˜İš[™Ê\œ‹›Y\ÜØYÙH\œŠKœÛXÙJN
JNÂˆBˆBˆB‚ˆÛÛœİ˜[˜XÚÈH˜[˜XÚÔ™\JY\ÜØYÙKİ]K\˜\Úİ]K™[]˜[
NÂˆÛÛœİ™^HYÚÜY[[ÜJİ]KÜ™X]ÜˆÜÚÙHÚ]ZYNˆ	Ôİš[™ÊY\ÜØYÙH	ÉÊKœÛXÙJL
_Xİ]KÛÜ›İ[YJNÂˆØ]™PZYTİ]J™^
NÂˆYZYSY[[ÜJÜ™X]ÜˆÜÚÙHÚ]ZYNˆ	Ôİš[™ÊY\ÜØYÙH	ÉÊKœÛXÙJLŒ
_XÈ\Nˆ	ØÜ™X]Ü‰Ë[\Ü[˜ÙNˆˆJNÂˆ™]\›ˆÈZYWÜ™\ÜÛœÙNˆ˜[˜XÚËİ]Nˆ™^NÂŸB‚›[Ù[K™^ÜÈHÈ\]PZYT›İ][™K›ØÙ\ÜĞZYSY\ÜØYÙKZ[ZYTÛØÚX[X[ÙİYKRQWÓĞĞUSÓ”ÈNÂ