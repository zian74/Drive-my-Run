'use strict';

/* ---------- Utilitaires ---------- */

const $ = (id) => document.getElementById(id);

function formatTime(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatPace(minPerKm) {
  const totalSec = minPerKm * 60;
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  const mm = s === 60 ? (m + 1).toString() : m.toString();
  const ss = s === 60 ? '00' : s.toString().padStart(2, '0');
  return `${mm}:${ss} /km`;
}

/* ---------- Roue sélecteur (style picker) ---------- */

const ITEM_H = 34;

class Wheel {
  constructor(el, options) {
    this.el = el;
    this.options = options; // [{ value, label }]
    this.index = 0;
    this.y = 0;
    this.dragging = false;
    this.lastY = 0;
    this.velocity = 0;
    this.lastT = 0;
    this.inertia = null;
    this.onChange = null;

    el.innerHTML = '<div class="highlight"></div><div class="items"></div>';
    this.itemsEl = el.querySelector('.items');
    this.itemsEl.innerHTML = options
      .map((o) => `<div class="item" data-i="${o.value}">${o.label}</div>`)
      .join('');

    el.addEventListener('pointerdown', this.onDown.bind(this));
    el.addEventListener('pointermove', this.onMove.bind(this));
    el.addEventListener('pointerup', this.onUp.bind(this));
    el.addEventListener('pointercancel', this.onUp.bind(this));
  }

  get value() { return this.options[this.index].value; }

  setIndex(i, silent) {
    const max = this.options.length - 1;
    this.index = Math.max(0, Math.min(max, i));
    this.y = -this.index * ITEM_H;
    this.render();
    if (!silent && this.onChange) this.onChange(this.value);
  }

  setValue(v, silent) {
    const i = this.options.findIndex((o) => o.value === v);
    this.setIndex(i >= 0 ? i : 0, silent);
  }

  render() {
    this.itemsEl.style.transform = `translateY(${this.y}px)`;
    this.itemsEl.querySelectorAll('.item').forEach((node, i) => {
      node.classList.toggle('dim', i !== this.index);
    });
  }

  onDown(e) {
    this.dragging = true;
    this.lastY = e.clientY;
    this.lastT = performance.now();
    this.velocity = 0;
    this.inertia = cancelAnimationFrame(this.inertia);
    this.el.setPointerCapture(e.pointerId);
  }

  onMove(e) {
    if (!this.dragging) return;
    const dy = e.clientY - this.lastY;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastT);
    this.velocity = (dy / dt) * 16;
    this.lastY = e.clientY;
    this.lastT = now;
    this.y += dy;
    this.itemsEl.style.transform = `translateY(${this.y}px)`;
  }

  onUp() {
    if (!this.dragging) return;
    this.dragging = false;
    const start = { y: this.y, v: this.velocity, t: performance.now() };
    const step = (now) => {
      const elapsed = now - start.t;
      const projected = start.y + start.v * elapsed * 0.06 - 0.5 * 0.006 * start.v * Math.min(elapsed, 600) * (elapsed / 60);
      const idx = Math.max(0, Math.min(this.options.length - 1, Math.round(-projected / ITEM_H)));
      this.setIndex(idx);
    };
    const idx = Math.max(0, Math.min(this.options.length - 1, Math.round(-(this.y + this.velocity * 12) / ITEM_H)));
    this.animateTo(idx);
  }

  animateTo(idx) {
    const targetY = -idx * ITEM_H;
    const startY = this.y;
    const dist = targetY - startY;
    if (Math.abs(dist) < 1) { this.setIndex(idx); return; }
    const dur = Math.min(400, 120 + Math.abs(dist));
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      this.y = startY + dist * eased;
      this.itemsEl.style.transform = `translateY(${this.y}px)`;
      if (p < 1) this.inertia = requestAnimationFrame(step);
      else this.setIndex(idx);
    };
    this.inertia = requestAnimationFrame(step);
  }
}

/* ---------- Options des roues ---------- */

function paceOptions() {
  const opts = [];
  for (let sec = 60; sec <= 900; sec += 5) {
    opts.push({ value: sec, label: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` });
  }
  return opts;
}

function speedOptions() {
  const opts = [];
  for (let v = 4; v <= 20; v += 0.5) {
    opts.push({ value: v, label: String(v % 1 === 0 ? v : v.toFixed(1)) });
  }
  return opts;
}

function durationOptions() {
  const opts = [];
  for (let m = 1; m <= 120; m++) {
    opts.push({ value: m * 60, label: m <= 60 ? `${m}′` : formatTime(m * 60) });
  }
  return opts;
}

function intervalOptions() {
  const opts = [{ value: 5, label: '5 m' }];
  for (let m = 10; m <= 100; m += 10) opts.push({ value: m, label: `${m} m` });
  return opts;
}

function countdownOptions() {
  return [0, 3, 5, 10, 15, 20, 30].map((s) => ({ value: s, label: s === 0 ? 'off' : `${s} s` }));
}

function repeatsOptions() {
  const opts = [];
  for (let n = 1; n <= 20; n++) opts.push({ value: n, label: `${n}×` });
  return opts;
}

function recoveryOptions() {
  const opts = [{ value: 0, label: 'aucune' }];
  for (let s = 30; s <= 900; s += 30) {
    opts.push({ value: s, label: s < 60 ? `${s} s` : formatTime(s) });
  }
  return opts;
}

/* ---------- Audio (Web Audio API) ---------- */

const AudioBeep = (() => {
  let ctx = null;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, duration, delay = 0, volume = 0.5) {
    const c = ensureCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    const t0 = c.currentTime + delay;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  }

  return {
    unlock() { ensureCtx(); },
    tick() { tone(880, 0.12); },
    go() { tone(1320, 0.35, 0, 0.6); },
    interval() { tone(990, 0.15); },
    sessionEnd() { tone(880, 0.18, 0); tone(1108, 0.18, 0.2); tone(1318, 0.45, 0.4, 0.6); },
    recoveryEnd() { tone(660, 0.15, 0); tone(990, 0.3, 0.18, 0.6); },
  };
})();

function notify(kind) {
  if (state.sound && (kind === 'tick' || kind === 'go' || kind === 'interval' || kind === 'sessionEnd' || kind === 'recoveryEnd')) {
    if (kind === 'tick') AudioBeep.tick();
    else if (kind === 'go') AudioBeep.go();
    else if (kind === 'interval') AudioBeep.interval();
    else if (kind === 'sessionEnd') AudioBeep.sessionEnd();
    else AudioBeep.recoveryEnd();
  }
  if (state.vibration && navigator.vibrate) {
    const patterns = { tick: 80, go: 300, interval: 120, sessionEnd: [300, 100, 300], recoveryEnd: [200, 80, 200] };
    if (patterns[kind]) navigator.vibrate(patterns[kind]);
  }
}

/* ---------- État ---------- */

const state = {
  sound: true,
  vibration: true,
  inputMode: 'pace',
  session: null,
  phase: 'idle',
  running: false,
  timerId: null,
  phaseStart: 0,
  phaseElapsedBeforePause: 0,
  countdownLastSecond: null,
  intervalsDone: 0,
  sessionsDone: 0,
  totalDistance: 0,
  totalRunTime: 0,
  beepCount: 0,
};

const wheels = {};

/* ---------- Écrans ---------- */

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

/* ---------- Préférences ---------- */

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('dmr-prefs') || '{}');
    if (p.inputMode === 'pace' || p.inputMode === 'speed') state.inputMode = p.inputMode;
    if (typeof p.sound === 'boolean') state.sound = p.sound;
    if (typeof p.vibration === 'boolean') state.vibration = p.vibration;
    state.prefs = p;
  } catch (_) { state.prefs = {}; }
  $('beep-sound').checked = state.sound;
  $('beep-vibration').checked = state.vibration;
}

function saveDefaults() {
  const d = {
    inputMode: state.inputMode,
    sound: $('beep-sound').checked,
    vibration: $('beep-vibration').checked,
    pace: wheels.pace.value,
    speed: wheels.speed.value,
    duration: wheels.duration.value,
    interval: wheels.interval.value,
    countdown: wheels.countdown.value,
    repeats: wheels.repeats.value,
    recovery: wheels.recovery.value,
  };
  try { localStorage.setItem('dmr-defaults', JSON.stringify(d)); } catch (_) { /* stockage indisponible */ }
}

function loadDefaults() {
  try { return JSON.parse(localStorage.getItem('dmr-defaults') || 'null'); } catch (_) { return null; }
}

function loadLibrary() {
  try { return JSON.parse(localStorage.getItem('dmr-library') || '[]'); } catch (_) { return []; }
}

function saveLibrary(list) {
  try { localStorage.setItem('dmr-library', JSON.stringify(list)); } catch (_) { /* stockage indisponible */ }
}

function currentSettings() {
  return {
    inputMode: state.inputMode,
    sound: $('beep-sound').checked,
    vibration: $('beep-vibration').checked,
    pace: wheels.pace.value,
    speed: wheels.speed.value,
    duration: wheels.duration.value,
    interval: wheels.interval.value,
    countdown: wheels.countdown.value,
    repeats: wheels.repeats.value,
    recovery: wheels.recovery.value,
  };
}

function applySettings(d, opts) {
  const s = d || {};
  state.inputMode = s.inputMode === 'speed' ? 'speed' : 'pace';
  wheels.pace.setValue(s.pace != null ? s.pace : 300, true);
  wheels.speed.setValue(s.speed != null ? s.speed : 12, true);
  wheels.duration.setValue(s.duration != null ? s.duration : 600, true);
  wheels.interval.setValue(s.interval != null && s.interval >= 5 && s.interval <= 100 ? s.interval : 100, true);
  wheels.countdown.setValue(s.countdown != null ? s.countdown : 3, true);
  wheels.repeats.setValue(s.repeats != null ? s.repeats : 1, true);
  wheels.recovery.setValue(s.recovery != null ? s.recovery : 120, true);
  $('beep-sound').checked = s.sound !== false;
  $('beep-vibration').checked = s.vibration !== false;
  state.sound = $('beep-sound').checked;
  state.vibration = $('beep-vibration').checked;
  applyInputMode();
  if (!(opts && opts.silent)) savePrefs();
}

function sessionLabel(d) {
  const paceTxt = d.inputMode === 'speed' ? `${d.speed} km/h` : `${Math.floor(d.pace / 60)}:${String(d.pace % 60).padStart(2, '0')}`;
  const durTxt = d.duration >= 3600 ? formatTime(d.duration) : `${d.duration / 60}′`;
  return `${paceTxt} • ${durTxt} • ${d.interval} m`;
}

function renderLibrary() {
  const list = loadLibrary();
  const wrap = $('library');
  const row = $('library-row');
  if (!list.length) { wrap.classList.add('hidden'); row.innerHTML = ''; return; }
  wrap.classList.remove('hidden');
  row.innerHTML = '';
  list.forEach((item, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    const label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = item.label;
    label.title = sessionLabel(item);
    label.addEventListener('click', () => applySettings(item));
    const del = document.createElement('button');
    del.className = 'chip-del';
    del.textContent = '×';
    del.title = 'Supprimer de la bibliothèque';
    del.addEventListener('click', () => {
      const l = loadLibrary();
      l.splice(i, 1);
      saveLibrary(l);
      renderLibrary();
    });
    chip.append(label, del);
    row.appendChild(chip);
  });
}

function savePrefs() {
  const p = {
    inputMode: state.inputMode,
    sound: $('beep-sound').checked,
    vibration: $('beep-vibration').checked,
    pace: wheels.pace.value,
    speed: wheels.speed.value,
    duration: wheels.duration.value,
    interval: wheels.interval.value,
    countdown: wheels.countdown.value,
    repeats: wheels.repeats.value,
    recovery: wheels.recovery.value,
  };
  try { localStorage.setItem('dmr-prefs', JSON.stringify(p)); } catch (_) { /* stockage indisponible */ }
}

function applyInputMode() {
  $('mode-pace').classList.toggle('active', state.inputMode === 'pace');
  $('mode-speed').classList.toggle('active', state.inputMode === 'speed');
  $('wrap-pace').classList.toggle('hidden', state.inputMode !== 'pace');
  $('wrap-speed').classList.toggle('hidden', state.inputMode !== 'speed');
  refreshSummary();
}

/* ---------- Lecture des paramètres ---------- */

function readInputs() {
  let speedKmh;
  if (state.inputMode === 'pace') {
    speedKmh = 3600 / wheels.pace.value;
  } else {
    speedKmh = wheels.speed.value;
  }

  const durationSec = wheels.duration.value;
  const intervalM = wheels.interval.value;
  const countdownSec = wheels.countdown.value;
  const repeats = wheels.repeats.value;
  const recoverySec = wheels.recovery.value;

  const distanceM = speedKmh * 1000 * (durationSec / 3600);
  if (distanceM < intervalM) return { error: 'Distance totale inférieure à l\'intervalle.' };

  const beepSec = (durationSec / distanceM) * intervalM;

  return { speedKmh, durationSec, intervalM, countdownSec, repeats, recoverySec, distanceM, beepSec, error: null };
}

function updateSummary() {
  const el = $('setup-summary');
  const errEl = $('setup-error');
  const p = readInputs();
  if (p.error) {
    el.classList.add('hidden');
    errEl.textContent = p.error;
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');
  el.classList.remove('hidden');
  const paceMinPerKm = 60 / p.speedKmh;
  el.innerHTML =
    `${(p.distanceM / 1000).toFixed(2)} km • bip tous les <strong>${p.beepSec.toFixed(1)} s</strong><br>` +
    `${p.repeats}× ${formatTime(p.durationSec)}` +
    (p.repeats > 1 && p.recoverySec > 0 ? ` + récup. ${formatTime(p.recoverySec)}` : '') +
    ` • total ${((p.distanceM * p.repeats) / 1000).toFixed(2)} km • ${formatPace(paceMinPerKm)}`;
}

function refreshSummary() { updateSummary(); }

/* ---------- Moteur de séance ---------- */

function startWorkout() {
  const p = readInputs();
  if (p.error) return;
  savePrefs();
  Object.assign(state, {
    session: p,
    phase: 'idle',
    running: false,
    intervalsDone: 0,
    sessionsDone: 0,
    totalDistance: 0,
    totalRunTime: 0,
    beepCount: 0,
    phaseElapsedBeforePause: 0,
  });
  AudioBeep.unlock();
  showScreen('run');
  $('btn-pause').textContent = 'Pause';
  $('stat-beep').textContent = `${p.beepSec.toFixed(1)} s`;
  $('stat-count').textContent = '0';
  $('stat-distance').textContent = '0 m';
  $('stat-session').textContent = `1/${p.repeats}`;
  beginPhase('countdown');
}

function beginPhase(phase) {
  state.phase = phase;
  state.running = true;
  state.phaseStart = performance.now();
  state.phaseElapsedBeforePause = 0;
  state.countdownLastSecond = null;
  clearInterval(state.timerId);
  state.timerId = setInterval(tick, 100);
  tick();
}

function phaseElapsed() {
  if (!state.running) return state.phaseElapsedBeforePause;
  return state.phaseElapsedBeforePause + (performance.now() - state.phaseStart) / 1000;
}

function setPhaseLabel(text, warn) {
  const el = $('run-phase');
  el.textContent = text;
  el.classList.toggle('warn', Boolean(warn));
}

function tick() {
  const p = state.session;
  const elapsed = phaseElapsed();

  if (state.phase === 'countdown') {
    if (p.countdownSec === 0) {
      notify('go');
      state.intervalsDone = 0;
      beginPhase('run');
      return;
    }
    if (state.sessionsDone > 0) {
      state.intervalsDone = 0;
      beginPhase('run');
      return;
    }
    const remaining = Math.ceil(p.countdownSec - elapsed);
    $('run-timer').textContent = String(Math.max(0, remaining));
    $('run-sub').textContent = 'Préparez-vous…';
    const sec = Math.ceil(elapsed);
    if (remaining > 0 && sec !== state.countdownLastSecond) {
      state.countdownLastSecond = sec;
      notify('tick');
    }
    if (elapsed >= p.countdownSec) {
      notify('go');
      state.intervalsDone = 0;
      beginPhase('run');
    }
    return;
  }

  if (state.phase === 'run') {
    const remaining = Math.max(0, p.durationSec - elapsed);
    $('run-timer').textContent = formatTime(remaining);
    $('run-sub').textContent = `temps écoulé ${formatTime(elapsed)}`;
    const distM = p.speedKmh * 1000 * (Math.min(elapsed, p.durationSec) / 3600);
    $('stat-distance').textContent = distM >= 1000 ? `${(distM / 1000).toFixed(2)} km` : `${Math.round(distM)} m`;
    const beepTarget = state.intervalsDone + 1;
    if (elapsed >= beepTarget * p.beepSec && beepTarget * p.beepSec <= p.durationSec) {
      state.intervalsDone += 1;
      state.beepCount += 1;
      notify('interval');
    }
    $('stat-count').textContent = String(state.intervalsDone);
    setPhaseLabel(`Course ${state.sessionsDone + 1}/${p.repeats}`, false);
    $('stat-session').textContent = `${state.sessionsDone + 1}/${p.repeats}`;
    if (elapsed >= p.durationSec) {
      state.sessionsDone += 1;
      state.totalDistance += p.distanceM;
      state.totalRunTime += p.durationSec;
      notify('sessionEnd');
      if (state.sessionsDone < p.repeats) {
        beginPhase(p.recoverySec > 0 ? 'recovery' : 'run');
      } else {
        finishWorkout();
      }
    }
    return;
  }

  if (state.phase === 'recovery') {
    const remaining = Math.max(0, p.recoverySec - elapsed);
    $('run-timer').textContent = formatTime(remaining);
    $('run-sub').textContent = 'récupération libre';
    setPhaseLabel(`Récupération (séance ${state.sessionsDone}/${p.repeats} faite)`, remaining <= 3);
    $('stat-session').textContent = `${state.sessionsDone + 1}/${p.repeats}`;
    const sec = Math.ceil(elapsed);
    if (remaining <= 3 && sec !== state.countdownLastSecond) {
      state.countdownLastSecond = sec;
      if (remaining > 0) notify('tick');
    }
    if (elapsed >= p.recoverySec) {
      notify('recoveryEnd');
      state.intervalsDone = 0;
      beginPhase('run');
    }
    return;
  }
}

function pauseWorkout() {
  if (!state.running) return;
  state.phaseElapsedBeforePause = phaseElapsed();
  state.running = false;
  clearInterval(state.timerId);
  $('btn-pause').textContent = 'Reprendre';
}

function resumeWorkout() {
  if (state.running) return;
  state.running = true;
  state.phaseStart = performance.now();
  state.timerId = setInterval(tick, 100);
  $('btn-pause').textContent = 'Pause';
  tick();
}

function stopWorkout() {
  finishWorkout(true);
}

function finishWorkout(stopped) {
  clearInterval(state.timerId);
  state.running = false;
  state.phase = 'idle';
  const body = $('summary-body');
  const distKm = (state.totalDistance / 1000).toFixed(2);
  body.innerHTML =
    `<strong>${state.sessionsDone}</strong> séance(s) effectuée(s)<br>` +
    `Distance courue : <strong>${distKm} km</strong><br>` +
    `Temps de course : <strong>${formatTime(state.totalRunTime)}</strong><br>` +
    `Bips émis : <strong>${state.beepCount}</strong>` +
    (stopped && state.sessionsDone === 0 ? '<br><em>Séance interrompue avant la première course.</em>' : '');
  $('summary-title').textContent = stopped ? 'Séance arrêtée' : 'Séance terminée 🎉';
  showScreen('summary');
}

/* ---------- Initialisation ---------- */

function initWheels() {
  wheels.pace = new Wheel($('wheel-pace'), paceOptions());
  wheels.speed = new Wheel($('wheel-speed'), speedOptions());
  wheels.duration = new Wheel($('wheel-duration'), durationOptions());
  wheels.interval = new Wheel($('wheel-interval'), intervalOptions());
  wheels.countdown = new Wheel($('wheel-countdown'), countdownOptions());
  wheels.repeats = new Wheel($('wheel-repeats'), repeatsOptions());
  wheels.recovery = new Wheel($('wheel-recovery'), recoveryOptions());

  const p = state.prefs || {};
  wheels.pace.setValue(p.pace != null ? p.pace : 300, true);
  wheels.speed.setValue(p.speed != null ? p.speed : 12, true);
  wheels.duration.setValue(p.duration != null ? p.duration : 600, true);
  wheels.interval.setValue(p.interval != null && p.interval <= 100 ? p.interval : 100, true);
  wheels.countdown.setValue(p.countdown != null ? p.countdown : 3, true);
  wheels.repeats.setValue(p.repeats != null ? p.repeats : 1, true);
  wheels.recovery.setValue(p.recovery != null ? p.recovery : 120, true);

  Object.values(wheels).forEach((w) => {
    w.onChange = refreshSummary;
  });
}

function initEvents() {
  $('btn-save-defaults').addEventListener('click', () => {
    saveDefaults();
    const btn = $('btn-save-defaults');
    btn.classList.add('saved');
    setTimeout(() => btn.classList.remove('saved'), 1200);
  });

  const backdrop = $('modal-backdrop');
  const nameInput = $('name-input');
  let pendingName = null;

  function openNameModal(defaultName) {
    pendingName = null;
    nameInput.value = defaultName || '';
    backdrop.classList.remove('hidden');
    setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
  }

  function closeNameModal() { backdrop.classList.add('hidden'); pendingName = null; }

  function confirmNameModal() {
    const name = nameInput.value.trim() || nameInput.placeholder;
    pendingName = name;
    backdrop.classList.add('hidden');
    const d = currentSettings();
    const list = loadLibrary();
    let finalName = name;
    let n = 2;
    while (list.some((it) => it.label === finalName)) finalName = `${name} (${n++})`;
    list.push({ label: finalName, ...d });
    saveLibrary(list);
    renderLibrary();
    const btn = $('btn-library');
    btn.classList.add('saved');
    setTimeout(() => btn.classList.remove('saved'), 1200);
    pendingName = null;
  }

  $('btn-library').addEventListener('click', () => {
    openNameModal(sessionLabel(currentSettings()));
  });

  $('name-cancel').addEventListener('click', closeNameModal);
  $('name-save').addEventListener('click', confirmNameModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeNameModal(); });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmNameModal();
    if (e.key === 'Escape') closeNameModal();
  });

  $('btn-reset').addEventListener('click', () => applySettings(loadDefaults()));

  $('mode-pace').addEventListener('click', () => { state.inputMode = 'pace'; applyInputMode(); });
  $('mode-speed').addEventListener('click', () => { state.inputMode = 'speed'; applyInputMode(); });
  $('beep-sound').addEventListener('change', () => { state.sound = $('beep-sound').checked; savePrefs(); });
  $('beep-vibration').addEventListener('change', () => { state.vibration = $('beep-vibration').checked; savePrefs(); });

  $('btn-start').addEventListener('click', startWorkout);
  $('btn-pause').addEventListener('click', () => (state.running ? pauseWorkout() : resumeWorkout()));
  $('btn-stop').addEventListener('click', stopWorkout);
  $('btn-again').addEventListener('click', startWorkout);
  $('btn-back').addEventListener('click', () => showScreen('setup'));

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.running) tick();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* SW indisponible */ });
  }
}

loadPrefs();
initWheels();
initEvents();
applyInputMode();
renderLibrary();
