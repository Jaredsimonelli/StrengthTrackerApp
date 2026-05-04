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
const LEGACY_STORAGE_KEYS = Array.from({ length: 14 }, (_, index) => `twoDayStrengthTracker.v${14 - index}`);
const state = loadState();
let deferredInstallPrompt = null;

const els = {
  week: document.querySelector("#weekInput"),
  day1: document.querySelector("#day1Button"),
  day2: document.querySelector("#day2Button"),
  title: document.querySelector("#workoutTitle"),
  phase: document.querySelector("#phaseLabel"),
  note: document.querySelector("#phaseNote"),
  list: document.querySelector("#exerciseList"),
  prs: document.querySelector("#prCount"),
  complete: document.querySelector("#completeCount"),
  submit: document.querySelector("#submitWorkoutButton"),
  history: document.querySelector("#historyList"),
  exportData: document.querySelector("#exportDataButton"),
  importData: document.querySelector("#importDataButton"),
  clearData: document.querySelector("#clearDataButton"),
  importFile: document.querySelector("#importDataInput"),
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
    collapsed: {}
  };
}

function normalizeState(saved) {
  const fallback = defaultState();
  const next = {
    ...fallback,
    ...saved,
    activeDay: Number(saved.activeDay) === 2 ? 2 : 1,
    activeWeek: Math.max(1, Number(saved.activeWeek || fallback.activeWeek)),
    sessions: saved.sessions && typeof saved.sessions === "object" ? saved.sessions : {},
    collapsed: saved.collapsed && typeof saved.collapsed === "object" ? saved.collapsed : {}
  };

  Object.values(next.sessions).forEach((session) => {
    session.submitted = Boolean(session.submitted);
    session.sets ||= {};
    session.validation ||= {};
    session.validationFields ||= {};
  });

  return next;
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
  return ex.blocks.map((block) => {
    const sets = targetSets(block.sets, block.type);
    const reps = ex.id === "kang-squat"
      ? block.reps
      : block.type === "work" ? exerciseTargetReps(ex.id, block.reps) : targetReps(block.reps);
    return `${sets}x${reps} ${block.type === "warmup" ? "warm up set" : "working set"}`;
  }).join(" · ");
}

function expandedSets(ex) {
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
  return Object.values(state.sessions)
    .filter((session) => {
      const isBefore = session.week < beforeWeek || (session.week === beforeWeek && session.day < beforeDay);
      const isDeload = weekPhase(session.week).name === "Deload";
      return session.submitted && isBefore && (includeDeloads || !isDeload);
    })
    .sort((a, b) => b.week - a.week || b.day - a.day || new Date(b.date) - new Date(a.date))
    .flatMap((session) => Object.entries(session.sets[exerciseId] || {})
      .filter(([setId, set]) => setId.startsWith("work") && Number(set.weight) > 0 && Number(set.reps) > 0)
      .map(([, set]) => ({ weight: Number(set.weight), reps: Number(set.reps), week: session.week, day: session.day })));
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
  const previous = previousWorkingSets(ex.id, state.activeWeek, state.activeDay, {
    includeDeloads: currentPhase.name === "Deload"
  });
  if (!previous.length) return "";

  const recent = previous.slice(0, 6);
  const target = firstWorkingTarget(ex);
  const increment = ex.category === "lower" ? 5 : 2.5;
  const recentAvgWeight = recent.reduce((sum, set) => sum + set.weight, 0) / recent.length;
  const best = recent.reduce((max, set) => Math.max(max, estimateOneRepMax(set.weight, set.reps)), 0);
  let suggested = best / (1 + target.reps / 30);

  if (currentPhase.name === "Deload") {
    suggested = recentAvgWeight * 0.9;
  } else {
    const cap = ex.category === "lower" ? 1.05 : 1.025;
    suggested = Math.min(suggested, recentAvgWeight * cap);
  }

  return String(roundToIncrement(suggested, increment));
}

function firstWorkingTarget(ex) {
  const block = ex.blocks.find((item) => item.type === "work");
  return { sets: targetSets(block.sets, "work"), reps: exerciseTargetReps(ex.id, block.reps) };
}

function render() {
  saveState();
  const phase = weekPhase(state.activeWeek);
  const workout = PLAN[state.activeDay];
  const session = activeSession();

  els.week.value = state.activeWeek;
  els.day1.classList.toggle("active", state.activeDay === 1);
  els.day2.classList.toggle("active", state.activeDay === 2);
  els.title.textContent = `Day ${state.activeDay}`;
  els.phase.textContent = `Week ${state.activeWeek} · ${phase.name}`;
  els.note.textContent = phase.note;
  els.list.textContent = "";

  workout.forEach((ex) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.querySelector(".exercise-name").textContent = ex.name;
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

function renderSummary() {
  const session = activeSession();
  let listedSets = 0;
  Object.values(session.sets).forEach((exerciseSets) => {
    Object.values(exerciseSets).forEach((set) => {
      listedSets += 1;
    });
  });
  els.complete.textContent = listedSets;
  els.prs.textContent = countSubmittedSessions();

  const hasLoggedWork = hasRecommendationData(session);
  els.submit.disabled = session.submitted;
  els.submit.classList.toggle("needs-data", !hasLoggedWork && !session.submitted);
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
  return Object.values(session.sets).some((sets) =>
    Object.entries(sets).some(([setId, set]) =>
      setId.startsWith("work") && Number(set.weight) > 0 && Number(set.reps) > 0
    )
  );
}

function clearValidation(session, validationKey, set) {
  if (Number(set.weight) > 0 && Number(set.reps) > 0) {
    delete session.validation[validationKey];
    delete session.validationFields[validationKey];
  }
}

function validateSession(session) {
  const workout = PLAN[session.day];
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

  if (state.activeDay === 1) {
    state.activeDay = 2;
  } else {
    state.activeDay = 1;
    state.activeWeek += 1;
  }

  render();
}

function exportData() {
  const backup = {
    app: "Two Day Strength",
    version: 1,
    exportedAt: new Date().toISOString(),
    state
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `two-day-strength-backup-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  els.dataStatus.textContent = "Backup file created.";
}

async function importDataFromFile(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const importedState = backup.state || backup;
    if (!importedState || typeof importedState !== "object" || !importedState.sessions) {
      throw new Error("Invalid backup");
    }

    const shouldRestore = window.confirm("Restore this backup? It will replace the workout data currently saved on this device.");
    if (!shouldRestore) {
      els.dataStatus.textContent = "Restore canceled.";
      return;
    }

    replaceState(importedState);
    els.dataStatus.textContent = "Backup restored.";
  } catch {
    els.dataStatus.textContent = "That backup file could not be restored.";
  } finally {
    els.importFile.value = "";
  }
}

function clearData() {
  [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].forEach((key) => localStorage.removeItem(key));
  replaceState(defaultState());
  els.dataStatus.textContent = "Workout data cleared.";
}

els.week.addEventListener("input", () => {
  state.activeWeek = Math.max(1, Number(els.week.value || 1));
  render();
});
els.day1.addEventListener("click", () => {
  state.activeDay = 1;
  render();
});
els.day2.addEventListener("click", () => {
  state.activeDay = 2;
  render();
});
els.submit.addEventListener("click", submitWorkout);
els.exportData.addEventListener("click", exportData);
els.importData.addEventListener("click", () => {
  els.importFile.click();
});
els.importFile.addEventListener("change", () => {
  importDataFromFile(els.importFile.files[0]);
});
els.clearData.addEventListener("click", clearData);

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
