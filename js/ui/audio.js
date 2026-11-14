/**
 * js/ui/audio.js
 * ระบบจัดการเสียงเพลงพื้นหลัง (BGM จาก ./assets/audio/bgm.mp3)
 * และเสียงเอฟเฟกต์กดปุ่ม (SFX ผ่าน Web Audio API)
 */

const AUDIO_STORAGE_KEY = 'thai_life_sim_audio_v1';
const BGM_SRC = './assets/audio/bgm.mp3';

let bgmAudio = null;
let bgmLoadFailed = false;
let audioCtx = null;
let hasUserInteracted = false;

let prefs = loadPrefs();

function loadPrefs() {
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return { bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.35 };
    return { bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.35, ...JSON.parse(raw) };
  } catch {
    return { bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.35 };
  }
}

function savePrefs() {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

function ensureBgmElement() {
  if (bgmAudio || bgmLoadFailed) return bgmAudio;
  bgmAudio = new Audio(BGM_SRC);
  bgmAudio.loop = true;
  bgmAudio.volume = prefs.bgmVolume;
  bgmAudio.preload = 'auto';

  bgmAudio.addEventListener('error', () => {
    bgmLoadFailed = true;
    console.warn('[Audio] ไม่พบไฟล์ ./assets/audio/bgm.mp3 (ข้ามการเล่นเพลงพื้นหลัง)');
  });
  return bgmAudio;
}

function getAudioContext() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function getAudioPrefs() {
  return { ...prefs };
}

export function tryPlayBgm() {
  if (!prefs.bgmEnabled || bgmLoadFailed) return;
  const audio = ensureBgmElement();
  if (!audio) return;
  audio.volume = prefs.bgmVolume;
  audio.play().catch(() => {
    // รอจนกว่าผู้ใช้จะแตะหน้าจออีกครั้ง (Browser Autoplay Policy)
  });
}

export function pauseBgm() {
  if (bgmAudio && !bgmAudio.paused) {
    bgmAudio.pause();
  }
}

export function toggleBgm() {
  prefs.bgmEnabled = !prefs.bgmEnabled;
  savePrefs();
  if (prefs.bgmEnabled) {
    bgmLoadFailed = false;
    tryPlayBgm();
  } else {
    pauseBgm();
  }
  return prefs.bgmEnabled;
}

export function toggleSfx() {
  prefs.sfxEnabled = !prefs.sfxEnabled;
  savePrefs();
  if (prefs.sfxEnabled) playSfx('click');
  return prefs.sfxEnabled;
}

/**
 * เล่นเสียงเอฟเฟกต์เบาๆ (click | success | error | coin)
 */
export function playSfx(type = 'click') {
  if (!prefs.sfxEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'success' || type === 'coin') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.06);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.19);
  } else if (type === 'error') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(160, now + 0.14);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.start(now);
    osc.stop(now + 0.17);
  } else {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.045);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.055);
  }
}

export function initAudioSystem() {
  const unlock = () => {
    if (!hasUserInteracted) {
      hasUserInteracted = true;
      getAudioContext();
      if (prefs.bgmEnabled) tryPlayBgm();
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseBgm();
    } else if (hasUserInteracted && prefs.bgmEnabled) {
      tryPlayBgm();
    }
  });
}