'use strict';

/* ---------- Utilitaires ---------- */

const $ = (id) => document.getElementById(id);

function parseTime(str) {
  if (!str) return NaN;
  const s = String(str).trim();
  if (/^\d+(:\d{1,2})?$/.test(s)) {
    const parts = s.split(':').map(Number);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
  }
  return NaN;
}

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
  if (state.sound && (kind === 'tick' || kind === 'go' || kind === 'interval')) {
    if (kind === 'tick') AudioBeep.tick();
    else if (kind === 'go') AudioBeep.go();
    else AudioBeep.interval();
  }
  if (kind === 'sessionEnd') AudioBeep.sessionEnd();
  else if (kind === 'recoveryEnd') AudioBeep.recoveryEnd();
  else if (state.vibration && navigator.vibrate) {
    const patterns = { tick: 80, go: 300, interval: 120, sessionEnd: [300, 100, 300], recoveryEnd: [200, 80, 200] };
    navigator.vibrate(patterns[kind]);
  }
}

/* ---------- État ---------- */

const state = {
  sound: true,
  vibration: true,
  inputMode: 'pace', // 'pace' | 'speed'
  session: null,     // paramètres calculés de la séance en cours
  phase: 'idle',     // idle | countdown | run | recovery
  running: false,
  timerId: null,
  phaseStart: 0,     // timestamp de début de phase (ms)
  phaseElapsedBeforePause: 0,
  countdownLastSecond: null,
  intervalsDone: 0,
  sessionsDone: 0,
  totalDistance: 0,
  totalRunTime: 0,
  beepCount: 0,
};

/* ---------- Écrans ---------- */

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

/* ---------- Configuration ---------- */

function loadPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem('dmr-prefs') || '{}');
    if (typeof prefs.inputMode === 'string') state.inputMode = prefs.inputMode;
    if (typeof prefs.sound === 'boolean') state.sound = prefs.sound;
    if (typeof prefs.vibration === 'boolean') state.vibration = prefs.vibration;
    if (prefs.pace) $('pace').value = prefs.pace;
    if (prefs.speed) $('speed').value = prefs.speed;
    if (prefs.duration) $('duration').value = prefs.duration;
    if (prefs.interval) $('interval').value = prefs.interval;
    if (typeof prefs.countdown === 'string' || typeof prefs.countdown === 'number') $('countdown').value = prefs.countdown;
    if (prefs.repeats) $('repeats').value = prefs.repeats;
    if (prefs.recovery) $('recovery').value = prefs.recovery;
  } catch (_) { /* préférences corrompues : on garde les valeurs par défaut */ }
  $('beep-sound').checked = state.sound;
  $('beep-vibration').checked = state.vibration;
  applyInputMode();
}

function savePrefs() {
  const prefs = {
    inputMode: state.inputMode,
    sound: $('beep-sound').checked,
    vibration: $('beep-vibration').checked,
    pace: $('pace').value,
    speed: $('speed').value,
    duration: $('duration').value,
    interval: $('interval').value,
    countdown: $('countdown').value,
    repeats: $('repeats').value,
    recovery: $('recovery').value,
  };
  try { localStorage.setItem('dmr-prefs', JSON.stringify(prefs)); } catch (_) { /* stockage indisponible */ }
}

function applyInputMode() {
  $('mode-pace').classList.toggle('active', state.inputMode === 'pace');
  $('mode-speed').classList.toggle('active', state.inputMode === 'speed');
  $('field-pace').classList.toggle('hidden', state.inputMode !== 'pace');
  $('field-speed').classList.toggle('hidden', state.inputMode !== 'speed');
}

function readInputs() {
  let speedKmh;
  if (state.inputMode === 'pace') {
    const paceSec = parseTime($('pace').value);
    if (!isFinite(paceSec) || paceSec <= 0) return { error: 'Allure invalide (ex. 5:00).' };
    speedKmh = 3600 / paceSec;
  } else {
    speedKmh = parseFloat($('speed').value);
    if (!isFinite(speedKmh) || speedKmh <= 0) return { error: 'Vitesse invalide.' };
  }

  const durationSec = parseTime($('duration').value);
  if (!isFinite(durationSec) || durationSec <= 0) return { error: 'Durée invalide (ex. 10:00).' };

  const intervalM = parseInt($('interval').value, 10);
  if (!isFinite(intervalM) || intervalM <= 0) return { error: 'Intervalle invalide (ex. 200).' };

  const countdownSec = Math.max(0, parseInt($('countdown').value, 10) || 0);
  const repeats = Math.max(1, parseInt($('repeats').value, 10) || 1);
  const recoverySec = parseTime($('recovery').value) || 0;

  const distanceM = speedKmh * 1000 * (durationSec / 3600);
  if (distanceM < intervalM) return { error: 'La distance totale est inférieure à l\'intervalle de bip.' };

  const beepSec = (durationSec / distanceM) * intervalM;

  return {
    speedKmh,
    durationSec,
    intervalM,
    countdownSec,
    repeats,
    recoverySec,
    distanceM,
    beepSec,
    error: null,
  };
}

function updateSummary(p) {
  const el = $('setup-summary');
  if (!p) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const paceMinPerKm = 60 / p.speedKmh;
  el.innerHTML =
    `Distance par séance : <strong>${(p.distanceM / 1000).toFixed(2)} km</strong><br>` +
    `Bip tous les : <strong>${p.beepSec.toFixed(1)} s</strong><br>` +
    `Distance totale (${p.repeats}×) : <strong>${((p.distanceM * p.repeats) / 1000).toFixed(2)} km</strong>` +
    (p.repeats > 1 ? ` — récup. ${formatTime(p.recoverySec)}` : '') +
    `<br>Allure : <strong>${formatPace(paceMinPerKm)}</strong> (${p.speedKmh.toFixed(1)} km/h)`;
}

function refreshSummary() {
  const errEl = $('setup-error');
  errEl.classList.add('hidden');
  const p = readInputs();
  if (p.error) { updateSummary(null); return; }
  updateSummary(p);
}

/* ---------- Moteur de séance ---------- */

function startWorkout() {
  const p = readInputs();
  const errEl = $('setup-error');
  if (p.error) {
    errEl.textContent = p.error;
    errEl.classList.remove('hidden');
    return;
  }
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
  $('btn-pause').disabled = false;
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

function phaseDuration(phase) {
  const p = state.session;
  if (phase === 'countdown') return p.countdownSec;
  if (phase === 'run') return p.durationSec;
  if (phase === 'recovery') return p.recoverySec;
  return 0;
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
    if (elapsed >= p.durationSec) {
      state.sessionsDone += 1;
      state.totalDistance += p.distanceM;
      state.totalRunTime += p.durationSec;
      notify('sessionEnd');
      if (state.sessionsDone < p.repeats) {
        beginPhase(p.recoverySec > 0 ? 'recovery' : 'countdown');
      } else {
        finishWorkout();
      }
    }
    return;
  }

  if (state.phase === 'recovery') {
    const remaining = Math.max(0, p.recoverySec - elapsed);
    $('stat-session').textContent = `${state.sessionsDone + 1}/${p.repeats}`;
    $('run-timer').textContent = formatTime(remaining);
    $('run-sub').textContent = `récupération — prochaine séance ${state.sessionsDone + 1}/${p.repeats}`;
    const warnWindow = remaining <= 3;
    setPhaseLabel(`Récupération (séance ${state.sessionsDone}/${p.repeats} faite)`, warnWindow);
    const sec = Math.ceil(elapsed);
    if (warnWindow && sec !== state.countdownLastSecond) {
      state.countdownLastSecond = sec;
      if (remaining > 0) notify('tick');
    }
    if (elapsed >= p.recoverySec) {
      notify('recoveryEnd');
      beginPhase('countdown');
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

function stopWorkout(silent) {
  clearInterval(state.timerId);
  state.running = false;
  state.phase = 'idle';
  if (!silent) finishWorkout(true);
}

function finishWorkout(stopped) {
  clearInterval(state.timerId);
  state.running = false;
  state.phase = 'idle';
  const p = state.session;
  const body = $('summary-body');
  const distKm = (state.totalDistance / 1000).toFixed(2);
  body.innerHTML =
    `<strong>${state.sessionsDone}</strong> séance(s) effectuée(s)<br>` +
    `Distance courue : <strong>${distKm} km</strong><br>` +
    `Temps de course : <strong>${formatTime(state.totalRunTime)}</strong><br>` +
    `Bips émis : <strong>${state.beepCount}</strong>` +
    (stopped && state.sessionsDone === 0 ? '<br><em>Séance interrompue avant la première course.</em>' : '');
  $('screen-summary').querySelector('h1').textContent = stopped ? 'Séance arrêtée' : 'Séance terminée 🎉';
  showScreen('summary');
}

/* ---------- Événements ---------- */

$('mode-pace').addEventListener('click', () => { state.inputMode = 'pace'; applyInputMode(); });
$('mode-speed').addEventListener('click', () => { state.inputMode = 'speed'; applyInputMode(); });

['pace', 'speed', 'duration', 'interval', 'countdown', 'repeats', 'recovery'].forEach((id) => {
  $(id).addEventListener('input', refreshSummary);
});

$('btn-start').addEventListener('click', startWorkout);
$('btn-pause').addEventListener('click', () => (state.running ? pauseWorkout() : resumeWorkout()));
$('btn-stop').addEventListener('click', () => stopWorkout(false));
$('btn-again').addEventListener('click', startWorkout);
$('btn-back').addEventListener('click', () => showScreen('setup'));

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.running && state.phaseStart) tick();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* SW indisponible : l'app reste utilisable en ligne */ });
}

loadPrefs();
refreshSummary();
