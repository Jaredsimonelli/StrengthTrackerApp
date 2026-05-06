const PLAN = {
  1: [
    exercise("Kang Squat", [{ type: "warmup", sets: 2, reps: 5 }, { type: "work", sets: 2, reps: 5 }], "lower"),
    exercise("Back Squat", [{ type: "warmup", sets: 1, reps: 5 }, { type: "work", sets: 3, reps: 8 }], "lower"),
    exercise("Push Press", [{ type: "warmup", sets: 2, reps: 5 }, { type: "work", sets: 3, reps: 5 }], "upper"),
    exercise("Hammer Curls", [{ type: "work", sets: 4, reps: 5 }], "accessory"),
    exercise("Shoulder Press", [{ type: "work", sets: 4, reps: 5 }], "upper"),
    exercise("Bicep 21's", [{ type: "work", sets: 3, reps: 21 }], "accessory"),
    exercise("Glute Bridge", [{ type: "warmup", sets: 2, reps: 8 }, { type: "work", sets: 2, reps: 5 }], "lower")
  ],
  2: [
    exercise("Kang Squat", [{ type: "warmup", sets: 2, reps: 5 }, { type: "work", sets: 2, reps: 5 }], "lower"),
    exercise("Deadlift", [{ type: "warmup", sets: 2, reps: 5 }, { type: "work", sets: 3, reps: 5 }], "lower"),
    exercise("Barbell Row", [{ type: "work", sets: 3, reps: 5 }], "upper"),
    exercise("Bench Press", [{ type: "warmup", sets: 2, reps: 8 }, { type: "work", sets: 2, reps: 8 }], "upper"),
    exercise("Incline Dumbbell Press", [{ type: "work", sets: 4, reps: 5 }], "upper"),
    exercise("Row Variation", [{ type: "work", sets: 3, reps: 6 }], "upper"),
    exercise("Glute Bridge", [{ type: "warmup", sets: 2, reps: 8 }, { type: "work", sets: 2, reps: 5 }], "lower")
  ]
};

const STORAGE_KEY = "twoDayStrengthTracker.data";
const BACKUP_KEY = "twoDayStrengthTracker.latestBackup";
const LEGACY_STORAGE_KEYS = Array.from({ length: 14 }, (_, index) => `twoDayStrengthTracker.v${14 - index}`);
const state = loadState();
let deferredInstallPrompt = null;
let pendingDeleteExerciseId = null;
let activeEditExerciseId = null;

const els = {
  weekLabel: document.querySelector("#weekLabel"),
  previousWeek: document.querySelector("#previousWeekButton"),
  nextWeek: document.querySelector("#nextWeekButton"),
  dayTabs: document.querySelector("#dayTabs"),
  title: document.querySelector("#workoutTitle"),
  phase: document.querySelector("#phaseLabel"),
  note: document.querySelector("#phaseNote"),
  list: document.querySelector("#exerciseList"),
  prs: document.querySelector("#prCount"),
  complete: document.querySelector("#completeCount"),
  submit: document.querySelector("#submitWorkoutButton"),
  history: document.querySelector("#historyList"),
  addCustom: document.querySelector("#addCustomButton"),
  removeDay: document.querySelector("#removeDayButton"),
  copyPrevious: document.querySelector("#copyPreviousButton"),
  copySchedule: document.querySelector("#copyScheduleButton"),
  customStatus: document.querySelector("#customStatus"),
  customForm: document.querySelector("#customFormCard"),
  customCategory: document.querySelector("#customCategory"),
  customName: document.querySelector("#customName"),
  customSetRows: document.querySelector("#customSetRows"),
  addCustomSet: document.querySelector("#addCustomSetButton"),
  saveCustom: document.querySelector("#saveCustomButton"),
  cancelCustom: document.querySelector("#cancelCustomButton"),
  deleteDialog: document.querySelector("#deleteCustomDialog"),
  deleteMessage: document.querySelector("#deleteCustomMessage"),
  confirmDelete: document.querySelector("#confirmDeleteButton"),
  removeDayDialog: document.querySelector("#removeDayDialog"),
  removeDayMessage: document.querySelector("#removeDayMessage"),
  confirmRemoveDay: document.querySelector("#confirmRemoveDayButton"),
  exportData: document.querySelector("#exportDataButton"),
  importData: document.querySelector("#importDataButton"),
  clearData: document.querySelector("#clearDataButton"),
  dataStatus: document.querySelector("#dataStatus"),
  install: document.querySelector("#installButton"),
  template: document.querySelector("#exerciseTemplate")
};

function exercise(name, blocks, category) {
  return { id: slug(name), name, blocks, category };
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function loadState() {
  const saved = safeParse(localStorage.getItem(STORAGE_KEY));
  if (saved) {
    return normalizeState(saved);
  }

  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = safeParse(localStorage.getItem(key));
    if (legacy) {
      const migrated = normalizeState(legacy);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  }

  return defaultState();
}

function safeParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function defaultState() {
  const today = new Date();
  return {
    activeDay: 1,
    activeWeek: 1,
    startedOn: today.toISOString().slice(0, 10),
    sessions: {},
    collapsed: {},
    customExercises: {},
    dayLayouts: {},
    defaultDayLayouts: {},
    weekDays: {}
  };
}

function normalizeState(saved) {
  const fallback = defaultState();
  const next = {
    ...fallback,
    ...saved,
    activeDay: normalizeDayNumber(saved.activeDay) || 1,
    activeWeek: Math.max(1, Number(saved.activeWeek || fallback.activeWeek)),
    sessions: saved.sessions && typeof saved.sessions === "object" ? saved.sessions : {},
    collapsed: saved.collapsed && typeof saved.collapsed === "object" ? saved.collapsed : {},
    customExercises: saved.customExercises && typeof saved.customExercises === "object" ? saved.customExercises : {},
    dayLayouts: saved.dayLayouts && typeof saved.dayLayouts === "object" ? saved.dayLayouts : {},
    defaultDayLayouts: saved.defaultDayLayouts && typeof saved.defaultDayLayouts === "object" ? saved.defaultDayLayouts : {},
    weekDays: saved.weekDays && typeof saved.weekDays === "object" ? saved.weekDays : {}
  };

  Object.values(next.sessions).forEach((session) => {
    session.submitted = Boolean(session.submitted);
    session.sets ||= {};
    session.validation ||= {};
    session.validationFields ||= {};
  });

  Object.keys(next.customExercises).forEach((key) => {
    if (!Array.isArray(next.customExercises[key])) {
      next.customExercises[key] = [];
      return;
    }

    next.customExercises[key] = next.customExercises[key].map((item, index) => normalizeCustomExercise(item, index));
  });

  Object.keys(next.dayLayouts).forEach((key) => {
    next.dayLayouts[key] = normalizeLayout(next.dayLayouts[key]);
  });

  Object.keys(next.defaultDayLayouts).forEach((key) => {
    next.defaultDayLayouts[key] = normalizeLayout(next.defaultDayLayouts[key]);
  });

  Object.keys(next.weekDays).forEach((week) => {
    next.weekDays[week] = normalizeWeekDays(next.weekDays[week]);
  });

  if (!getDaysForWeekValue(next, next.activeWeek).includes(next.activeDay)) {
    next.activeDay = getDaysForWeekValue(next, next.activeWeek)[0];
  }

  return next;
}

function normalizeDayNumber(value) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 7 ? day : null;
}

function normalizeWeekDays(days) {
  const normalized = Array.from(new Set((Array.isArray(days) ? days : [])
    .map(normalizeDayNumber)
    .filter(Boolean)))
    .sort((a, b) => a - b)
    .slice(0, 7);
  return normalized.length ? normalized : [1, 2];
}

function getDaysForWeekValue(source, week) {
  return normalizeWeekDays(source.weekDays?.[String(week)] || [1, 2]);
}

function normalizeLayout(layout) {
  return {
    order: Array.isArray(layout?.order) ? layout.order.filter(Boolean) : [],
    hidden: layout?.hidden && typeof layout.hidden === "object" ? layout.hidden : {}
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function replaceState(nextState) {
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, normalizeState(nextState));
  saveState();
  render();
}

function makeId(prefix = "custom") {
  if (window.crypto && window.crypto.randomUUID) {
    return `${prefix}:${window.crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCustomExercise(item = {}, index = 0) {
  const setRows = normalizeCustomSetRows(item.setRows || rowsFromBlocks(item.blocks) || [
    { type: item.blocks?.[0]?.type || "work", reps: item.blocks?.[0]?.reps || item.reps || 5 }
  ]);
  return {
    id: item.id || makeId(),
    name: String(item.name || "Custom lift").trim() || "Custom lift",
    category: item.category === "lift" ? "lift" : "accessory",
    sourceId: item.sourceId || null,
    createdAt: item.createdAt || new Date().toISOString(),
    deletedAt: item.deletedAt || null,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    custom: true,
    setRows,
    blocks: blocksFromSetRows(setRows)
  };
}

function rowsFromBlocks(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return null;
  return blocks.flatMap((block) =>
    Array.from({ length: Math.max(1, Number(block.sets || 1)) }, () => ({
      id: makeId("set"),
      type: block.type === "warmup" ? "warmup" : "work",
      reps: Math.max(1, Number(block.reps || 5))
    }))
  );
}

function normalizeCustomSetRows(rows) {
  return rows.map((row) => ({
    id: row.id || makeId("set"),
    type: row.type === "warmup" ? "warmup" : "work",
    reps: Math.max(1, Number(row.reps || 1))
  }));
}

function blocksFromSetRows(rows) {
  return normalizeCustomSetRows(rows).reduce((blocks, row) => {
    const last = blocks[blocks.length - 1];
    if (last && last.type === row.type && last.reps === row.reps) {
      last.sets += 1;
    } else {
      blocks.push({ type: row.type, reps: row.reps, sets: 1 });
    }
    return blocks;
  }, []);
}

function customExerciseKey(week = state.activeWeek, day = state.activeDay) {
  return sessionKey(week, day);
}

function customExercisesFor(week = state.activeWeek, day = state.activeDay) {
  const key = customExerciseKey(week, day);
  state.customExercises[key] ||= [];
  state.customExercises[key] = state.customExercises[key]
    .map((item, index) => normalizeCustomExercise(item, index))
    .sort((a, b) => a.order - b.order);
  return state.customExercises[key];
}

function activeCustomExercises(week = state.activeWeek, day = state.activeDay) {
  return customExercisesFor(week, day).filter((item) => !item.deletedAt);
}

function getDaysForWeek(week = state.activeWeek) {
  return getDaysForWeekValue(state, week);
}

function setDaysForWeek(week, days) {
  state.weekDays ||= {};
  state.weekDays[String(week)] = normalizeWeekDays(days);
}

function ensureActiveDayForWeek() {
  const days = getDaysForWeek();
  if (!days.includes(state.activeDay)) {
    state.activeDay = days[0];
    activeEditExerciseId = null;
  }
}

function addDayToWeek() {
  const days = getDaysForWeek();
  if (days.length >= 7) {
    els.customStatus.textContent = "Maximum of 7 days per week.";
    return;
  }

  const nextDay = Array.from({ length: 7 }, (_, index) => index + 1).find((day) => !days.includes(day));
  setDaysForWeek(state.activeWeek, [...days, nextDay]);
  state.activeDay = nextDay;
  activeEditExerciseId = null;
  els.customStatus.textContent = `Day ${nextDay} added to Week ${state.activeWeek}.`;
  saveState();
  render();
}

function canRemoveActiveDay() {
  return state.activeDay > 2 && getDaysForWeek().includes(state.activeDay);
}

function openRemoveDayDialog() {
  if (!canRemoveActiveDay()) {
    els.customStatus.textContent = "Day 1 and Day 2 stay in every week.";
    return;
  }

  els.removeDayMessage.textContent =
    `Remove Day ${state.activeDay} from Week ${state.activeWeek}? This deletes that day's lifts, layout changes, and entered weights for this week only.`;
  els.removeDayDialog.showModal();
}

function removeActiveDay() {
  if (!canRemoveActiveDay()) return;

  const removedDay = state.activeDay;
  const removedKey = sessionKey(state.activeWeek, removedDay);
  const remainingDays = getDaysForWeek().filter((day) => day !== removedDay);

  setDaysForWeek(state.activeWeek, remainingDays);
  delete state.sessions[removedKey];
  delete state.customExercises[removedKey];
  delete state.dayLayouts[removedKey];
  Object.keys(state.collapsed || {}).forEach((key) => {
    if (key.startsWith(`${removedKey}-`)) {
      delete state.collapsed[key];
    }
  });

  state.activeDay = remainingDays.includes(removedDay - 1) ? removedDay - 1 : remainingDays[0];
  activeEditExerciseId = null;
  saveState();
  render();
  els.customStatus.textContent = `Day ${removedDay} removed from Week ${state.activeWeek}.`;
}

function defaultLayoutForDay(day = state.activeDay) {
  const key = `d${day}`;
  state.defaultDayLayouts ||= {};
  state.defaultDayLayouts[key] ||= { order: [], hidden: {} };
  state.defaultDayLayouts[key] = normalizeLayout(state.defaultDayLayouts[key]);
  return state.defaultDayLayouts[key];
}

function layoutForDay(week = state.activeWeek, day = state.activeDay) {
  const key = sessionKey(week, day);
  state.dayLayouts ||= {};
  state.dayLayouts[key] ||= {
    order: [...defaultLayoutForDay(day).order],
    hidden: { ...defaultLayoutForDay(day).hidden }
  };
  state.dayLayouts[key] = normalizeLayout(state.dayLayouts[key]);
  return state.dayLayouts[key];
}

function exerciseOrderKey(ex) {
  return ex.custom ? ex.sourceId || ex.id : ex.id;
}

function baseExercisesForDay(week = state.activeWeek, day = state.activeDay) {
  return [...(PLAN[day] || []), ...activeCustomExercises(week, day)];
}

function exercisesForDay(week = state.activeWeek, day = state.activeDay) {
  const layout = layoutForDay(week, day);
  const base = baseExercisesForDay(week, day).filter((ex) => !layout.hidden[ex.id] && !layout.hidden[exerciseOrderKey(ex)]);
  const ids = new Set(base.flatMap((ex) => [ex.id, exerciseOrderKey(ex)]));
  const order = layout.order.filter((id) => ids.has(id));
  const missing = base.map((ex) => exerciseOrderKey(ex)).filter((id) => !order.includes(id));
  layout.order = [...order, ...missing];
  const byId = new Map(base.flatMap((ex) => [[ex.id, ex], [exerciseOrderKey(ex), ex]]));
  return layout.order.map((id) => byId.get(id)).filter(Boolean);
}

function normalizeCustomOrder(list) {
  list.filter((item) => !item.deletedAt).forEach((item, index) => {
    item.order = index;
  });
}

function sessionKey(week = state.activeWeek, day = state.activeDay) {
  return `w${week}-d${day}`;
}

function activeSession() {
  const key = sessionKey();
  state.sessions[key] ||= {
    week: state.activeWeek,
    day: state.activeDay,
    date: new Date().toISOString(),
    submitted: false,
    sets: {},
    validation: {},
    validationFields: {}
  };
  state.sessions[key].validation ||= {};
  state.sessions[key].validationFields ||= {};
  return state.sessions[key];
}

function weekPhase(week) {
  const blockWeek = ((week - 1) % 4) + 1;
  if (blockWeek === 4) {
    return {
      name: "Deload",
      note: "Keep the pattern, reduce stress, and use fewer working sets before building again.",
      setFactor: 0.5,
      repOffset: 0
    };
  }
  const phases = [
    { name: "Base volume", note: "Hit clean target reps. Strong submitted sets can nudge future weight recommendations up.", setFactor: 1, repOffset: 0 },
    { name: "Build", note: "Target reps dip slightly while effort rises. Stay crisp and leave one good rep in reserve.", setFactor: 1, repOffset: -1 },
    { name: "Heavy", note: "Lower reps, higher intent. Log honestly so the next wave can adjust without guesswork.", setFactor: 1, repOffset: -2 }
  ];
  return phases[blockWeek - 1];
}

function targetReps(baseReps, week = state.activeWeek) {
  if (baseReps === 21) return 21;
  const phase = weekPhase(week);
  if (phase.name === "Deload") return baseReps;
  return Math.max(3, baseReps + phase.repOffset);
}

function exerciseTargetReps(exerciseId, baseReps, week = state.activeWeek) {
  if (exerciseId === "kang-squat") return baseReps;
  return targetReps(baseReps, week);
}

function targetSets(baseSets, type, week = state.activeWeek) {
  const phase = weekPhase(week);
  if (phase.name !== "Deload" || type === "warmup") return baseSets;
  return Math.max(1, Math.ceil(baseSets * phase.setFactor));
}

function prescription(ex) {
  if (ex.custom) {
    return blocksFromSetRows(ex.setRows).map((block) =>
      `${block.sets}x${block.reps} ${block.type === "warmup" ? "warm up set" : "working set"}`
    ).join(" · ");
  }

  return ex.blocks.map((block) => {
    const sets = targetSets(block.sets, block.type);
    const reps = ex.id === "kang-squat"
      ? block.reps
      : block.type === "work" ? exerciseTargetReps(ex.id, block.reps) : targetReps(block.reps);
    return `${sets}x${reps} ${block.type === "warmup" ? "warm up set" : "working set"}`;
  }).join(" · ");
}

function expandedSets(ex) {
  if (ex.custom) {
    const counters = { warmup: 0, work: 0 };
    return normalizeCustomSetRows(ex.setRows).map((row) => {
      counters[row.type] += 1;
      return {
        id: row.id,
        label: `${row.type === "warmup" ? "Warm up set" : "Working set"} ${counters[row.type]}`,
        type: row.type,
        reps: row.reps
      };
    });
  }

  return ex.blocks.flatMap((block) => {
    const count = targetSets(block.sets, block.type);
    return Array.from({ length: count }, (_, i) => ({
      id: `${block.type}-${i + 1}`,
      label: `${block.type === "warmup" ? "Warm up set" : "Working set"} ${i + 1}`,
      type: block.type,
      reps: ex.id === "kang-squat"
        ? block.reps
        : block.type === "work" ? exerciseTargetReps(ex.id, block.reps) : targetReps(block.reps)
    }));
  });
}

function getSet(session, exerciseId, setId) {
  session.sets[exerciseId] ||= {};
  session.sets[exerciseId][setId] ||= { weight: "", reps: null };
  return session.sets[exerciseId][setId];
}

function previousWorkingSets(exerciseId, beforeWeek = state.activeWeek, beforeDay = state.activeDay, options = {}) {
  const includeDeloads = Boolean(options.includeDeloads);
  const exerciseIds = Array.isArray(exerciseId) ? exerciseId : [exerciseId];
  return Object.values(state.sessions)
    .filter((session) => {
      const isBefore = session.week < beforeWeek || (session.week === beforeWeek && session.day < beforeDay);
      const isDeload = weekPhase(session.week).name === "Deload";
      return session.submitted && isBefore && (includeDeloads || !isDeload);
    })
    .sort((a, b) => b.week - a.week || b.day - a.day || new Date(b.date) - new Date(a.date))
    .flatMap((session) => exerciseIds.flatMap((id) => Object.entries(session.sets[id] || {})
      .filter(([setId, set]) => setId.startsWith("work") && Number(set.weight) > 0 && Number(set.reps) > 0)
      .map(([, set]) => ({ weight: Number(set.weight), reps: Number(set.reps), week: session.week, day: session.day }))));
}

function estimateOneRepMax(weight, reps) {
  return weight * (1 + reps / 30);
}

function roundToIncrement(value, increment = 5) {
  if (!value || Number.isNaN(value)) return "";
  return Math.round(value / increment) * increment;
}

function recommendation(ex) {
  const currentPhase = weekPhase(state.activeWeek);
  const previous = previousWorkingSets([ex.id, ex.sourceId].filter(Boolean), state.activeWeek, state.activeDay, {
    includeDeloads: currentPhase.name === "Deload"
  });
  if (!previous.length) return "";

  const recent = previous.slice(0, 6);
  const target = firstWorkingTarget(ex);
  if (!target.reps) return "";
  const isHeavyLift = ex.category === "lower" || ex.category === "lift";
  const increment = isHeavyLift ? 5 : 2.5;
  const recentAvgWeight = recent.reduce((sum, set) => sum + set.weight, 0) / recent.length;
  const best = recent.reduce((max, set) => Math.max(max, estimateOneRepMax(set.weight, set.reps)), 0);
  let suggested = best / (1 + target.reps / 30);

  if (currentPhase.name === "Deload") {
    suggested = recentAvgWeight * 0.9;
  } else {
    const cap = isHeavyLift ? 1.05 : 1.025;
    suggested = Math.min(suggested, recentAvgWeight * cap);
  }

  return String(roundToIncrement(suggested, increment));
}

function firstWorkingTarget(ex) {
  const block = ex.blocks.find((item) => item.type === "work");
  if (!block) return { sets: 0, reps: 0 };
  return {
    sets: ex.custom ? block.sets : targetSets(block.sets, "work"),
    reps: ex.custom ? block.reps : exerciseTargetReps(ex.id, block.reps)
  };
}

function render() {
  ensureActiveDayForWeek();
  const phase = weekPhase(state.activeWeek);
  const workout = exercisesForDay();
  saveState();
  const session = activeSession();
  if (activeEditExerciseId && !workout.some((ex) => ex.id === activeEditExerciseId)) {
    activeEditExerciseId = null;
  }

  els.weekLabel.textContent = state.activeWeek;
  els.previousWeek.disabled = state.activeWeek <= 1;
  renderDayTabs();
  els.title.textContent = `Day ${state.activeDay}`;
  els.phase.textContent = `Week ${state.activeWeek} · ${phase.name}`;
  els.note.textContent = phase.note;
  els.list.textContent = "";
  const canCopyPreviousLifts = previousWeekHasDay(state.activeWeek, state.activeDay);
  els.copyPrevious.hidden = !canCopyPreviousLifts;
  els.copyPrevious.disabled = !canCopyPreviousLifts;
  els.copySchedule.hidden = state.activeWeek <= 1;
  els.copySchedule.disabled = state.activeWeek <= 1;
  els.removeDay.hidden = !canRemoveActiveDay();
  els.removeDay.disabled = !canRemoveActiveDay();
  if (!els.customStatus.textContent) {
    els.customStatus.textContent = "";
  }

  if (!workout.length) {
    const empty = document.createElement("div");
    empty.className = "empty-day";
    empty.innerHTML = `
      <h2>No lifts yet</h2>
      <p>Add your first lift for this day.</p>
    `;
    els.list.append(empty);
  }

  workout.forEach((ex) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.classList.toggle("custom-exercise-card", Boolean(ex.custom));
    const name = node.querySelector(".exercise-name");
    name.textContent = ex.name;
    if (ex.custom) {
      const badge = document.createElement("span");
      badge.className = "custom-badge";
      badge.textContent = ex.category === "lift" ? "Lift" : "Accessory";
      name.append(badge);
    }
    node.querySelector(".exercise-prescription").textContent = prescription(ex);
    const recommendedWeight = recommendation(ex);
    const head = node.querySelector(".exercise-head");
    const sets = node.querySelector(".sets");
    const collapsedKey = `${sessionKey()}-${ex.id}`;
    sets.hidden = Boolean(state.collapsed[collapsedKey]);
    head.addEventListener("click", () => {
      state.collapsed[collapsedKey] = !state.collapsed[collapsedKey];
      render();
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "exercise-edit-button";
    editButton.textContent = "✎";
    editButton.title = activeEditExerciseId === ex.id ? "Close lift actions" : "Edit lift";
    editButton.ariaLabel = activeEditExerciseId === ex.id ? `Close actions for ${ex.name}` : `Edit ${ex.name}`;
    editButton.addEventListener("click", () => {
      activeEditExerciseId = activeEditExerciseId === ex.id ? null : ex.id;
      render();
    });
    node.append(editButton);

    if (activeEditExerciseId === ex.id) {
      const actions = document.createElement("div");
      actions.className = "exercise-actions exercise-manage-actions";
      const index = workout.findIndex((item) => item.id === ex.id);
      actions.append(
        customActionButton("↑", "Move lift up", () => moveExercise(ex.id, -1), index <= 0),
        customActionButton("↓", "Move lift down", () => moveExercise(ex.id, 1), index === workout.length - 1),
        customActionButton("×", "Remove lift", () => openDeleteExerciseDialog(ex), false, "delete-action")
      );
      node.insertBefore(actions, sets);
    }

    expandedSets(ex).forEach((target) => {
      const saved = getSet(session, ex.id, target.id);
      saved.reps = String(target.reps);
      const validationKey = `${ex.id}:${target.id}`;
      const validation = session.validation[validationKey];
      const validationFields = session.validationFields[validationKey] || [];
      const row = document.createElement("div");
      row.className = [
        "set-row",
        target.type === "warmup" ? "set-row--warmup" : "set-row--work",
        validation ? "has-error" : "",
        validationFields.includes("weight") ? "missing-weight" : ""
      ].filter(Boolean).join(" ");

      const label = document.createElement("span");
      label.className = "set-label";
      label.textContent = target.label;

      const reps = document.createElement("span");
      reps.className = "target-reps";
      reps.textContent = `${target.reps} reps`;

      const weightWrap = document.createElement("label");
      weightWrap.className = "weight-field";
      weightWrap.ariaLabel = `${ex.name} ${target.label} weight`;

      const weight = document.createElement("input");
      weight.type = "number";
      weight.min = "0";
      weight.step = "2.5";
      weight.inputMode = "decimal";
      weight.placeholder = target.type === "work" ? recommendedWeight : "";
      weight.className = "weight-input";
      weight.value = saved.weight;

      const unit = document.createElement("span");
      unit.className = "weight-unit";
      unit.textContent = "lb";
      weightWrap.append(weight, unit);

      const recommendationHint = document.createElement("button");
      recommendationHint.type = "button";
      recommendationHint.className = "weight-hint";
      recommendationHint.textContent = target.type === "work" && recommendedWeight ? `Suggested ${recommendedWeight} lb` : "";
      recommendationHint.hidden = !recommendationHint.textContent;
      recommendationHint.addEventListener("pointerdown", (event) => {
        event.preventDefault();
      });
      recommendationHint.addEventListener("click", () => {
        if (!recommendedWeight) return;
        saved.weight = recommendedWeight;
        saved.reps = String(target.reps);
        session.submitted = false;
        delete session.submittedAt;
        clearValidation(session, validationKey, saved);
        saveState();
        render();
      });

      const message = document.createElement("p");
      message.className = "set-error";
      message.textContent = validation || "";
      message.hidden = !validation;

      weight.addEventListener("input", () => {
        saved.weight = weight.value;
        saved.reps = String(target.reps);
        session.submitted = false;
        delete session.submittedAt;
        clearValidation(session, validationKey, saved);
        saveState();
        renderSummary();
      });
      weight.addEventListener("blur", () => {
        render();
      });
      const weightCell = document.createElement("div");
      weightCell.className = "weight-cell";
      weightCell.append(weightWrap, recommendationHint);

      row.append(label, reps, weightCell);
      sets.append(row);
      sets.append(message);

      if (state.focusValidationKey === validationKey) {
        window.setTimeout(() => {
          row.scrollIntoView({ block: "center", behavior: "smooth" });
          weight.focus({ preventScroll: true });
          delete state.focusValidationKey;
          saveState();
        }, 0);
      }
    });

    els.list.append(node);
  });

  renderSummary();
  renderHistory();
}

function renderDayTabs() {
  const days = getDaysForWeek();
  els.dayTabs.textContent = "";
  days.forEach((day) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.className = `day-tab${day === state.activeDay ? " active" : ""}`;
    button.dataset.day = String(day);
    button.textContent = `Day ${day}`;
    button.ariaSelected = String(day === state.activeDay);
    button.addEventListener("click", () => {
      state.activeDay = day;
      activeEditExerciseId = null;
      render();
    });
    els.dayTabs.append(button);
  });

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "add-day-button";
  addButton.textContent = "+";
  addButton.title = days.length >= 7 ? "Maximum of 7 days per week" : "Add day";
  addButton.ariaLabel = days.length >= 7 ? "Maximum of 7 days per week" : "Add day";
  addButton.disabled = days.length >= 7;
  addButton.addEventListener("click", addDayToWeek);
  els.dayTabs.append(addButton);
  window.requestAnimationFrame(() => {
    centerActiveDayTab();
    updateDayTabOverflow();
  });
}

function centerActiveDayTab() {
  const activeTab = els.dayTabs.querySelector(".day-tab.active");
  activeTab?.scrollIntoView({ block: "nearest", inline: "center" });
}

function updateDayTabOverflow() {
  const maxScroll = els.dayTabs.scrollWidth - els.dayTabs.clientWidth;
  els.dayTabs.classList.toggle("has-overflow-left", els.dayTabs.scrollLeft > 2);
  els.dayTabs.classList.toggle("has-overflow-right", maxScroll - els.dayTabs.scrollLeft > 2);
}

function renderSummary() {
  const session = activeSession();
  const listedSets = exercisesForDay(session.week, session.day)
    .reduce((total, ex) => total + expandedSets(ex).length, 0);
  els.complete.textContent = listedSets;
  els.prs.textContent = countSubmittedSessions();

  const hasLoggedWork = hasRecommendationData(session);
  els.submit.disabled = session.submitted || listedSets === 0;
  els.submit.classList.toggle("needs-data", listedSets > 0 && !hasLoggedWork && !session.submitted);
}

function countSubmittedSessions() {
  return Object.values(state.sessions).filter((session) => session.submitted).length;
}

function renderHistory() {
  const weeks = Object.values(state.sessions)
    .filter((session) => session.submitted)
    .reduce((summary, session) => {
      summary[session.week] ||= { week: session.week, days: new Set(), latestDate: session.submittedAt || session.date };
      summary[session.week].days.add(session.day);
      if (new Date(session.submittedAt || session.date) > new Date(summary[session.week].latestDate)) {
        summary[session.week].latestDate = session.submittedAt || session.date;
      }
      return summary;
    }, {});

  const summaries = Object.values(weeks)
    .sort((a, b) => b.week - a.week)
    .slice(0, 8);

  els.history.textContent = "";
  if (!summaries.length) {
    els.history.textContent = "Weekly summaries will show up here after you submit workouts.";
    return;
  }

  summaries.forEach((summary) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `history-item${summary.week === state.activeWeek ? " active" : ""}`;
    const loggedDays = Array.from(summary.days).sort((a, b) => a - b);
    const dayText = loggedDays.map((day) => `Day ${day}`).join(" + ");
    item.innerHTML = `
      <span>
        <strong>Week ${summary.week}</strong>
        <small>${dayText}</small>
      </span>
      <span class="history-action">View</span>
    `;
    item.addEventListener("click", () => {
      state.activeWeek = summary.week;
      state.activeDay = loggedDays[0] || 1;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    els.history.append(item);
  });
}

function hasRecommendationData(session) {
  return exercisesForDay(session.week, session.day).some((ex) =>
    expandedSets(ex).some((target) => {
      if (target.type !== "work") return false;
      const set = session.sets[ex.id]?.[target.id];
      return Number(set?.weight) > 0 && Number(set?.reps) > 0;
    })
  );
}

function clearValidation(session, validationKey, set) {
  if (Number(set.weight) > 0 && Number(set.reps) > 0) {
    delete session.validation[validationKey];
    delete session.validationFields[validationKey];
  }
}

function customActionButton(text, label, onClick, disabled = false, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.title = label;
  button.ariaLabel = label;
  button.disabled = disabled;
  button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

function moveExercise(id, direction) {
  const workout = exercisesForDay();
  const index = workout.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= workout.length) return;

  const order = workout.map((item) => exerciseOrderKey(item));
  [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
  setLayoutOrder(defaultLayoutForDay(), order);
  Object.entries(state.dayLayouts || {}).forEach(([key, layout]) => {
    if (key.endsWith(`-d${state.activeDay}`)) {
      setLayoutOrder(layout, order);
    }
  });
  activeEditExerciseId = id;
  saveState();
  render();
}

function setLayoutOrder(layout, order) {
  const extraIds = (layout.order || []).filter((id) => !order.includes(id));
  const hiddenIds = Object.keys(layout.hidden || {}).filter((hiddenId) => layout.hidden[hiddenId]);
  layout.order = [
    ...order,
    ...extraIds,
    ...hiddenIds.filter((hiddenId) => !order.includes(hiddenId) && !extraIds.includes(hiddenId))
  ];
}

function previousWeekHasDay(week, day) {
  return week > 1 && getDaysForWeek(week - 1).includes(day);
}

function exerciseToCustomCopy(ex, index, visibleCount) {
  const setRows = expandedSets(ex).map((set) => ({
    type: set.type,
    reps: set.reps
  }));
  return normalizeCustomExercise({
    id: makeId(),
    name: ex.name,
    category: ex.category === "lift" || ex.category === "lower" || ex.category === "upper" ? "lift" : "accessory",
    sourceId: ex.sourceId || ex.id,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    order: visibleCount + index,
    setRows
  }, visibleCount + index);
}

function showCustomForm() {
  els.customForm.hidden = false;
  els.customStatus.textContent = "";
  els.customCategory.value = "accessory";
  els.customName.value = "";
  renderCustomSetFormRows([
    { type: "work", reps: 5 },
    { type: "work", reps: 5 },
    { type: "work", reps: 5 }
  ]);
  els.customName.focus();
}

function hideCustomForm() {
  els.customForm.hidden = true;
}

function addCustomExercise() {
  const name = els.customName.value.trim();
  const setRows = readCustomSetFormRows();
  if (!name) {
    els.customStatus.textContent = "Lift name is required.";
    els.customName.focus();
    return;
  }
  if (!setRows.length) {
    els.customStatus.textContent = "Add at least one set.";
    return;
  }

  const list = customExercisesFor();
  const visibleCount = list.filter((item) => !item.deletedAt).length;
  list.push(normalizeCustomExercise({
    id: makeId(),
    name,
    category: els.customCategory.value,
    setRows,
    order: visibleCount
  }, list.length));
  normalizeCustomOrder(list);
  hideCustomForm();
  els.customStatus.textContent = `${name} added to Week ${state.activeWeek}, Day ${state.activeDay}.`;
  saveState();
  render();
}

function renderCustomSetFormRows(rows) {
  els.customSetRows.textContent = "";
  normalizeCustomSetRows(rows).forEach((row, index) => {
    const editor = document.createElement("div");
    editor.className = `custom-set-row ${row.type === "warmup" ? "set-row--warmup" : "set-row--work"}`;

    const typeLabel = document.createElement("label");
    typeLabel.textContent = `Set ${index + 1}`;
    const typeSelect = document.createElement("select");
    typeSelect.className = "custom-row-type";
    typeSelect.innerHTML = `
      <option value="work">Working set</option>
      <option value="warmup">Warm up set</option>
    `;
    typeSelect.value = row.type;
    typeSelect.addEventListener("change", () => {
      editor.classList.toggle("set-row--warmup", typeSelect.value === "warmup");
      editor.classList.toggle("set-row--work", typeSelect.value !== "warmup");
    });
    typeLabel.append(typeSelect);

    const repsLabel = document.createElement("label");
    repsLabel.textContent = "Reps";
    const repsInput = document.createElement("input");
    repsInput.className = "custom-row-reps";
    repsInput.type = "number";
    repsInput.min = "1";
    repsInput.max = "100";
    repsInput.step = "1";
    repsInput.inputMode = "numeric";
    repsInput.value = row.reps;
    repsLabel.append(repsInput);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.ariaLabel = `Remove set ${index + 1}`;
    remove.addEventListener("click", () => {
      editor.remove();
      renumberCustomSetRows();
    });

    editor.append(typeLabel, repsLabel, remove);
    els.customSetRows.append(editor);
  });
}

function readCustomSetFormRows() {
  return Array.from(els.customSetRows.querySelectorAll(".custom-set-row")).map((row) => ({
    type: row.querySelector(".custom-row-type").value,
    reps: Math.max(1, Number(row.querySelector(".custom-row-reps").value || 1))
  }));
}

function renumberCustomSetRows() {
  Array.from(els.customSetRows.querySelectorAll(".custom-set-row label:first-child")).forEach((label, index) => {
    label.firstChild.textContent = `Set ${index + 1}`;
  });
}

function addCustomSetRow() {
  const rows = readCustomSetFormRows();
  rows.push({ type: "work", reps: rows[rows.length - 1]?.reps || 5 });
  renderCustomSetFormRows(rows);
}

function openDeleteExerciseDialog(ex) {
  pendingDeleteExerciseId = ex.id;
  els.deleteMessage.textContent = `This removes ${ex.name} from Week ${state.activeWeek}, Day ${state.activeDay} only.`;
  els.deleteDialog.showModal();
}

function deletePendingExercise() {
  if (!pendingDeleteExerciseId) return;
  const list = customExercisesFor();
  const item = list.find((custom) => custom.id === pendingDeleteExerciseId);
  const workoutItem = exercisesForDay().find((ex) => ex.id === pendingDeleteExerciseId) || item;

  if (item) {
    item.deletedAt = new Date().toISOString();
    delete activeSession().sets[item.id];
    normalizeCustomOrder(list);
    els.customStatus.textContent = `${item.name} removed from this week only.`;
  } else {
    const layout = layoutForDay();
    layout.hidden[pendingDeleteExerciseId] = true;
    delete activeSession().sets[pendingDeleteExerciseId];
    els.customStatus.textContent = `${workoutItem?.name || "Lift"} removed from this week and day only.`;
  }
  activeEditExerciseId = null;
  pendingDeleteExerciseId = null;
  saveState();
  render();
}

function copyPreviousWeekCustomExercises() {
  if (state.activeWeek <= 1) {
    els.customStatus.textContent = "There is no previous week to copy.";
    return;
  }

  if (!previousWeekHasDay(state.activeWeek, state.activeDay)) {
    els.customStatus.textContent = `No Day ${state.activeDay} found in Week ${state.activeWeek - 1}.`;
    return;
  }

  const previous = exercisesForDay(state.activeWeek - 1, state.activeDay);
  if (!previous.length) {
    els.customStatus.textContent = `No lifts found for Week ${state.activeWeek - 1}, Day ${state.activeDay}.`;
    return;
  }

  const currentDefaults = new Set((PLAN[state.activeDay] || []).map((ex) => ex.id));
  const currentSources = new Set(exercisesForDay().map((ex) => ex.sourceId || ex.id));
  const list = customExercisesFor();
  const visibleCount = list.filter((item) => !item.deletedAt).length;

  const copied = previous
    .filter((ex) => !currentDefaults.has(ex.sourceId || ex.id) && !currentSources.has(ex.sourceId || ex.id))
    .map((ex, index) => exerciseToCustomCopy(ex, index, visibleCount));

  if (!copied.length) {
    els.customStatus.textContent = `Week ${state.activeWeek}, Day ${state.activeDay} already has last week's lifts.`;
    return;
  }

  list.push(...copied);
  normalizeCustomOrder(list);
  els.customStatus.textContent = `${copied.length} ${copied.length === 1 ? "lift" : "lifts"} copied from Week ${state.activeWeek - 1}, Day ${state.activeDay}.`;
  saveState();
  render();
}

function copyPreviousWeekSchedule() {
  if (state.activeWeek <= 1) {
    els.customStatus.textContent = "There is no previous week schedule to copy.";
    return;
  }

  const previousDays = getDaysForWeek(state.activeWeek - 1);
  setDaysForWeek(state.activeWeek, previousDays);
  if (!previousDays.includes(state.activeDay)) {
    state.activeDay = previousDays[0];
  }
  activeEditExerciseId = null;
  els.customStatus.textContent = `Week ${state.activeWeek} schedule copied from Week ${state.activeWeek - 1}.`;
  saveState();
  render();
}

function validateSession(session) {
  const workout = exercisesForDay(session.week, session.day);
  session.validation = {};
  session.validationFields = {};
  let firstWorkingSet = null;
  const partials = [];

  for (const ex of workout) {
    for (const target of expandedSets(ex)) {
      if (target.type !== "work") continue;
      firstWorkingSet ||= { ex, target };
      const set = getSet(session, ex.id, target.id);
      const hasWeight = Number(set.weight) > 0;

      if (hasWeight) {
        set.reps = String(target.reps);
        return true;
      }

      if (!hasWeight) {
        partials.push({
          key: `${ex.id}:${target.id}`,
          fields: ["weight"],
          message: `${ex.name}, ${target.label} needs weight.`
        });
      }
    }
  }

  if (partials.length) {
    partials.forEach((partial) => {
      session.validation[partial.key] = partial.message;
      session.validationFields[partial.key] = partial.fields;
    });
    return false;
  }

  if (firstWorkingSet) {
    session.validation[`${firstWorkingSet.ex.id}:${firstWorkingSet.target.id}`] =
      `${firstWorkingSet.ex.name}, ${firstWorkingSet.target.label} needs weight.`;
    session.validationFields[`${firstWorkingSet.ex.id}:${firstWorkingSet.target.id}`] = ["weight"];
  }

  return false;
}

function submitWorkout() {
  const session = activeSession();
  const workout = exercisesForDay();
  if (!workout.length) {
    els.customStatus.textContent = `Add at least one lift before submitting Week ${state.activeWeek}, Day ${state.activeDay}.`;
    return;
  }

  if (!validateSession(session)) {
    const firstError = Object.keys(session.validation)[0];
    state.focusValidationKey = firstError;
    saveState();
    render();
    return;
  }
  session.validation = {};
  session.validationFields = {};
  session.submitted = true;
  session.submittedAt = new Date().toISOString();
  session.date = session.submittedAt;

  const days = getDaysForWeek();
  const dayIndex = days.indexOf(state.activeDay);
  if (dayIndex >= 0 && dayIndex < days.length - 1) {
    state.activeDay = days[dayIndex + 1];
  } else {
    state.activeDay = 1;
    state.activeWeek += 1;
  }

  render();
}

function exportData() {
  const backup = {
    app: "Strength Tracker",
    version: 1,
    exportedAt: new Date().toISOString(),
    state
  };
  localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  els.dataStatus.textContent = `Latest backup saved in this app at ${new Date(backup.exportedAt).toLocaleString()}.`;
}

function restoreData() {
  try {
    const backup = safeParse(localStorage.getItem(BACKUP_KEY));
    const importedState = backup.state || backup;
    if (!importedState || typeof importedState !== "object" || !importedState.sessions) {
      throw new Error("Invalid backup");
    }

    const exportedAt = backup.exportedAt ? ` from ${new Date(backup.exportedAt).toLocaleString()}` : "";
    const shouldRestore = window.confirm(`Restore the latest backup${exportedAt}? It will replace the workout data currently saved on this device.`);
    if (!shouldRestore) {
      els.dataStatus.textContent = "Restore canceled.";
      return;
    }

    replaceState(importedState);
    els.dataStatus.textContent = "Latest backup restored.";
  } catch {
    els.dataStatus.textContent = "No saved backup found in this app.";
  }
}

function clearTodayData() {
  const shouldClear = window.confirm(`Clear entered weights for Week ${state.activeWeek}, Day ${state.activeDay}? Custom lifts and backups are kept.`);
  if (!shouldClear) {
    els.customStatus.textContent = "Clear canceled.";
    return;
  }

  delete state.sessions[sessionKey()];
  activeEditExerciseId = null;
  saveState();
  render();
  els.customStatus.textContent = `Week ${state.activeWeek}, Day ${state.activeDay} data cleared.`;
}

els.previousWeek.addEventListener("click", () => {
  state.activeWeek = Math.max(1, state.activeWeek - 1);
  ensureActiveDayForWeek();
  activeEditExerciseId = null;
  render();
});
els.nextWeek.addEventListener("click", () => {
  state.activeWeek += 1;
  ensureActiveDayForWeek();
  activeEditExerciseId = null;
  render();
});
els.submit.addEventListener("click", submitWorkout);
els.addCustom.addEventListener("click", showCustomForm);
els.removeDay.addEventListener("click", openRemoveDayDialog);
els.cancelCustom.addEventListener("click", hideCustomForm);
els.saveCustom.addEventListener("click", addCustomExercise);
els.addCustomSet.addEventListener("click", addCustomSetRow);
els.copyPrevious.addEventListener("click", copyPreviousWeekCustomExercises);
els.copySchedule.addEventListener("click", copyPreviousWeekSchedule);
els.confirmDelete.addEventListener("click", (event) => {
  event.preventDefault();
  els.deleteDialog.close();
  deletePendingExercise();
});
els.confirmRemoveDay.addEventListener("click", (event) => {
  event.preventDefault();
  els.removeDayDialog.close();
  removeActiveDay();
});
els.dayTabs.addEventListener("scroll", updateDayTabOverflow, { passive: true });
window.addEventListener("resize", updateDayTabOverflow);
els.exportData.addEventListener("click", exportData);
els.importData.addEventListener("click", restoreData);
els.clearData.addEventListener("click", clearTodayData);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  els.install.hidden = false;
});

els.install.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  els.install.hidden = true;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

render();
