const { ruralRhythmPhase } = require('./life-rhythm');

function tempoForPhase(phase) {
  if (phase === 'deep_night' || phase === 'night_sleep') {
    return { settleGap: 18, plannerGap: 90, lifeGap: 45 };
  }
  if (phase === 'wake_and_breakfast' || phase === 'midday_meal' || phase === 'evening_meal_social') {
    return { settleGap: 10, plannerGap: 35, lifeGap: 18 };
  }
  if (phase === 'midday_rest' || phase === 'quiet_evening') {
    return { settleGap: 16, plannerGap: 45, lifeGap: 24 };
  }
  return { settleGap: 8, plannerGap: 28, lifeGap: 14 };
}

function decisionPhase(worldTime) {
  return ruralRhythmPhase(worldTime || '06:00');
}

function canCallPlanner(state = {}, absMinute, worldTime) {
  const tempo = tempoForPhase(decisionPhase(worldTime));
  const last = Number(state.last_planner_call_abs || state.last_aida_planner_call_abs || 0);
  return !last || absMinute - last >= tempo.plannerGap;
}

function canCallLifeBrain(state = {}, absMinute, worldTime) {
  const tempo = tempoForPhase(decisionPhase(worldTime));
  const last = Number(state.last_life_brain_call_abs || state.last_aida_life_brain_call_abs || 0);
  return !last || absMinute - last >= tempo.lifeGap;
}

function markCompletedTempo(state = {}, absMinute, label, source) {
  if (source === 'tempo') return state;
  return {
    ...state,
    last_completed_task_abs: absMinute,
    last_completed_task_label: label || null,
    last_completed_task_source: source || null
  };
}

function shouldSettleAfterTask(state = {}, absMinute, worldTime) {
  const last = Number(state.last_completed_task_abs || 0);
  if (!last) return false;
  const tempo = tempoForPhase(decisionPhase(worldTime));
  return absMinute - last >= 0 && absMinute - last < tempo.settleGap;
}

function makeSettleTask(characterName, state = {}, absMinute, worldTime) {
  if (!shouldSettleAfterTask(state, absMinute, worldTime)) return null;
  const phase = decisionPhase(worldTime);
  const isAida = characterName === 'aida';
  const duration = Math.max(5, tempoForPhase(phase).settleGap - (absMinute - Number(state.last_completed_task_abs || 0)));
  return {
    source: 'tempo',
    label: phase === 'quiet_evening' || phase === 'midday_rest'
      ? 'Quiet Pause'
      : 'Catching Breath',
    action: isAida ? 'resting' : 'sitting',
    location: isAida ? 'home' : 'home',
    duration,
    reason: 'natural pause after finishing a task'
  };
}

function rememberLifeBrainCall(state = {}, characterName, absMinute) {
  return characterName === 'aida'
    ? { ...state, last_aida_life_brain_call_abs: absMinute }
    : { ...state, last_life_brain_call_abs: absMinute };
}

module.exports = {
  decisionPhase,
  tempoForPhase,
  canCallPlanner,
  canCallLifeBrain,
  markCompletedTempo,
  makeSettleTask,
  rememberLifeBrainCall
};
