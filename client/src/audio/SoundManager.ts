import { readJson, writeJson } from '@/utils/storage';

/**
 * Áudio 100% sintetizado com Web Audio API.
 *
 * Decisão de arquitetura: nada de arquivos .mp3/.wav. Os efeitos e a trilha são
 * gerados em tempo real, o que dá três vantagens para um portal de minijogos:
 * bundle minúsculo, latência zero (nenhum download antes do primeiro dash) e
 * variação infinita (cada dash tem um pitch levemente diferente).
 *
 * O contexto só é criado depois do primeiro gesto do usuário, respeitando a
 * política de autoplay dos navegadores.
 */

export type SfxName =
  | 'click'
  | 'hover'
  | 'select'
  | 'ready'
  | 'unready'
  | 'join'
  | 'leave'
  | 'copy'
  | 'error'
  | 'emote'
  | 'countdown'
  | 'go'
  | 'dash'
  | 'hit'
  | 'bigHit'
  | 'out'
  | 'shrink'
  | 'crownGrab'
  | 'crownSteal'
  | 'crownDrop'
  | 'crownAlert'
  | 'bombPass'
  | 'bombTick'
  | 'bombExplode'
  | 'tileCrack'
  | 'tileFall'
  | 'paintSplash'
  | 'paintRush'
  | 'win'
  | 'lose'
  | 'confetti';

export type MusicMood = 'none' | 'menu' | 'lobby' | 'match';

export interface AudioSettings {
  sound: boolean;
  music: boolean;
}

const STORAGE_KEY = 'orelha.audio';
const DEFAULTS: AudioSettings = { sound: true, music: true };

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

type Listener = (settings: AudioSettings) => void;

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;

  private settings: AudioSettings = readJson(STORAGE_KEY, DEFAULTS);
  private listeners = new Set<Listener>();

  private mood: MusicMood = 'none';
  private schedulerId: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private tension = 0;
  private unlocked = false;

  // -------------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------------

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.getSettings();
    for (const listener of this.listeners) listener(snapshot);
  }

  /** Chamado no primeiro gesto do usuário (clique/tecla/toque). */
  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    if (!this.unlocked) {
      this.unlocked = true;
      if (this.settings.music && this.mood !== 'none') this.startScheduler();
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.85;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.16;

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = this.settings.sound ? 0.8 : 0;

    const musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 2200;
    musicFilter.Q.value = 0.6;

    const musicBus = ctx.createGain();
    musicBus.gain.value = this.settings.music ? 0.22 : 0;

    sfxBus.connect(master);
    musicBus.connect(musicFilter);
    musicFilter.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);

    // ruído reutilizável (impactos, explosões, tinta)
    const frames = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.master = master;
    this.sfxBus = sfxBus;
    this.musicBus = musicBus;
    this.musicFilter = musicFilter;
    this.noise = buffer;
    return ctx;
  }

  // -------------------------------------------------------------------------
  // Configurações
  // -------------------------------------------------------------------------

  setSound(on: boolean): void {
    this.settings.sound = on;
    writeJson(STORAGE_KEY, this.settings);
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.02);
    }
    this.notify();
    if (on) this.play('click');
  }

  setMusic(on: boolean): void {
    this.settings.music = on;
    writeJson(STORAGE_KEY, this.settings);
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.08);
    }
    if (on) {
      if (this.unlocked && this.mood !== 'none') this.startScheduler();
    } else {
      this.stopScheduler();
    }
    this.notify();
  }

  toggleSound(): void {
    this.setSound(!this.settings.sound);
  }

  toggleMusic(): void {
    this.setMusic(!this.settings.music);
  }

  // -------------------------------------------------------------------------
  // Efeitos
  // -------------------------------------------------------------------------

  private tone(options: {
    freq: number;
    type?: OscillatorType;
    dur?: number;
    gain?: number;
    attack?: number;
    slideTo?: number;
    delay?: number;
    detune?: number;
  }): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const {
      freq,
      type = 'sine',
      dur = 0.16,
      gain = 0.3,
      attack = 0.006,
      slideTo,
      delay = 0,
      detune = 0,
    } = options;
    const start = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (detune) osc.detune.setValueAtTime(detune, start);
    if (slideTo && slideTo > 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + dur);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(env);
    env.connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }

  private hiss(options: {
    dur?: number;
    gain?: number;
    freq?: number;
    sweepTo?: number;
    type?: BiquadFilterType;
    delay?: number;
    q?: number;
  }): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || !this.noise) return;
    const {
      dur = 0.2,
      gain = 0.2,
      freq = 1200,
      sweepTo,
      type = 'bandpass',
      delay = 0,
      q = 1,
    } = options;
    const start = ctx.currentTime + delay;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, start);
    filter.Q.value = q;
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), start + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(bus);
    src.start(start);
    src.stop(start + dur + 0.05);
  }

  play(name: SfxName, opts: { volume?: number; pitch?: number } = {}): void {
    if (!this.settings.sound) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') return; // sem gesto do usuário ainda
    const v = opts.volume ?? 1;
    const p = opts.pitch ?? 1;
    const jitter = 0.96 + Math.random() * 0.08;

    switch (name) {
      case 'click':
        this.tone({ freq: 620 * p, type: 'triangle', dur: 0.07, gain: 0.2 * v, slideTo: 880 * p });
        break;
      case 'hover':
        this.tone({ freq: 980 * p * jitter, type: 'sine', dur: 0.05, gain: 0.06 * v });
        break;
      case 'select':
        this.tone({ freq: 520 * p, type: 'triangle', dur: 0.09, gain: 0.2 * v, slideTo: 780 });
        this.tone({ freq: 1040 * p, type: 'sine', dur: 0.12, gain: 0.1 * v, delay: 0.06 });
        break;
      case 'ready':
        this.tone({ freq: 660, type: 'triangle', dur: 0.1, gain: 0.22 * v });
        this.tone({ freq: 990, type: 'triangle', dur: 0.14, gain: 0.18 * v, delay: 0.08 });
        break;
      case 'unready':
        this.tone({ freq: 460, type: 'triangle', dur: 0.12, gain: 0.16 * v, slideTo: 300 });
        break;
      case 'join':
        this.tone({ freq: 520, type: 'sine', dur: 0.12, gain: 0.2 * v });
        this.tone({ freq: 780, type: 'sine', dur: 0.14, gain: 0.18 * v, delay: 0.09 });
        this.tone({ freq: 1040, type: 'sine', dur: 0.18, gain: 0.14 * v, delay: 0.18 });
        break;
      case 'leave':
        this.tone({ freq: 640, type: 'sine', dur: 0.16, gain: 0.16 * v, slideTo: 320 });
        break;
      case 'copy':
        this.tone({ freq: 1180, type: 'sine', dur: 0.07, gain: 0.16 * v });
        this.tone({ freq: 1560, type: 'sine', dur: 0.1, gain: 0.12 * v, delay: 0.05 });
        break;
      case 'error':
        this.tone({ freq: 300, type: 'square', dur: 0.12, gain: 0.14 * v });
        this.tone({ freq: 220, type: 'square', dur: 0.18, gain: 0.12 * v, delay: 0.1 });
        break;
      case 'emote':
        this.tone({ freq: 880 * jitter, type: 'triangle', dur: 0.1, gain: 0.16 * v, slideTo: 1320 });
        break;
      case 'countdown':
        this.tone({ freq: 700 * p, type: 'triangle', dur: 0.16, gain: 0.26 * v });
        this.hiss({ dur: 0.08, gain: 0.05 * v, freq: 2600 });
        break;
      case 'go':
        this.tone({ freq: 523, type: 'triangle', dur: 0.16, gain: 0.3 * v });
        this.tone({ freq: 784, type: 'triangle', dur: 0.2, gain: 0.26 * v, delay: 0.07 });
        this.tone({ freq: 1046, type: 'triangle', dur: 0.34, gain: 0.24 * v, delay: 0.14 });
        this.hiss({ dur: 0.3, gain: 0.1 * v, freq: 900, sweepTo: 4200 });
        break;
      case 'dash':
        this.hiss({ dur: 0.16, gain: 0.16 * v, freq: 500, sweepTo: 3200, q: 0.8 });
        this.tone({ freq: 420 * jitter, type: 'sawtooth', dur: 0.12, gain: 0.1 * v, slideTo: 900 });
        break;
      case 'hit':
        this.hiss({ dur: 0.13, gain: 0.2 * v, freq: 1500, sweepTo: 300, type: 'lowpass', q: 1.2 });
        this.tone({ freq: 200 * jitter, type: 'square', dur: 0.1, gain: 0.16 * v, slideTo: 90 });
        break;
      case 'bigHit':
        this.hiss({ dur: 0.26, gain: 0.3 * v, freq: 2200, sweepTo: 180, type: 'lowpass', q: 1.4 });
        this.tone({ freq: 150, type: 'square', dur: 0.2, gain: 0.24 * v, slideTo: 60 });
        this.tone({ freq: 90, type: 'sine', dur: 0.34, gain: 0.2 * v, slideTo: 40 });
        break;
      case 'out':
        this.tone({ freq: 700, type: 'triangle', dur: 0.5, gain: 0.22 * v, slideTo: 120 });
        this.hiss({ dur: 0.4, gain: 0.08 * v, freq: 1400, sweepTo: 200 });
        break;
      case 'shrink':
        this.tone({ freq: 180, type: 'sine', dur: 0.4, gain: 0.14 * v, slideTo: 120 });
        this.hiss({ dur: 0.3, gain: 0.05 * v, freq: 500, sweepTo: 180 });
        break;
      case 'crownGrab':
        this.tone({ freq: 784, type: 'triangle', dur: 0.12, gain: 0.24 * v });
        this.tone({ freq: 1175, type: 'triangle', dur: 0.16, gain: 0.2 * v, delay: 0.07 });
        this.tone({ freq: 1568, type: 'sine', dur: 0.26, gain: 0.16 * v, delay: 0.14 });
        break;
      case 'crownSteal':
        this.tone({ freq: 1568, type: 'triangle', dur: 0.1, gain: 0.22 * v, slideTo: 900 });
        this.hiss({ dur: 0.18, gain: 0.14 * v, freq: 2400, sweepTo: 600 });
        this.tone({ freq: 300, type: 'square', dur: 0.12, gain: 0.12 * v });
        break;
      case 'crownDrop':
        this.tone({ freq: 500, type: 'triangle', dur: 0.3, gain: 0.18 * v, slideTo: 180 });
        this.hiss({ dur: 0.22, gain: 0.1 * v, freq: 1800, sweepTo: 400 });
        break;
      case 'crownAlert':
        this.tone({ freq: 1046, type: 'square', dur: 0.1, gain: 0.14 * v });
        this.tone({ freq: 1046, type: 'square', dur: 0.1, gain: 0.14 * v, delay: 0.16 });
        this.tone({ freq: 1318, type: 'square', dur: 0.16, gain: 0.14 * v, delay: 0.32 });
        break;
      case 'bombPass':
        this.tone({ freq: 300 * jitter, type: 'square', dur: 0.08, gain: 0.16 * v, slideTo: 640 });
        this.hiss({ dur: 0.1, gain: 0.1 * v, freq: 1800 });
        break;
      case 'bombTick':
        this.tone({ freq: 1400 * p, type: 'square', dur: 0.035, gain: 0.1 * v });
        break;
      case 'bombExplode':
        this.hiss({ dur: 0.55, gain: 0.36 * v, freq: 900, sweepTo: 90, type: 'lowpass', q: 1.1 });
        this.tone({ freq: 120, type: 'sawtooth', dur: 0.4, gain: 0.26 * v, slideTo: 40 });
        this.tone({ freq: 70, type: 'sine', dur: 0.6, gain: 0.24 * v, slideTo: 30 });
        this.hiss({ dur: 0.3, gain: 0.12 * v, freq: 3000, sweepTo: 900, delay: 0.04 });
        break;
      case 'tileCrack':
        this.hiss({ dur: 0.09, gain: 0.1 * v, freq: 2600 * jitter, q: 2.4 });
        break;
      case 'tileFall':
        this.tone({ freq: 260 * jitter, type: 'triangle', dur: 0.26, gain: 0.12 * v, slideTo: 70 });
        this.hiss({ dur: 0.2, gain: 0.07 * v, freq: 800, sweepTo: 160 });
        break;
      case 'paintSplash':
        this.hiss({ dur: 0.14, gain: 0.12 * v, freq: 700 * jitter, sweepTo: 2200, q: 0.9 });
        this.tone({ freq: 520 * jitter, type: 'sine', dur: 0.12, gain: 0.1 * v, slideTo: 820 });
        break;
      case 'paintRush':
        this.tone({ freq: 660, type: 'triangle', dur: 0.14, gain: 0.22 * v, slideTo: 990 });
        this.tone({ freq: 990, type: 'triangle', dur: 0.2, gain: 0.2 * v, delay: 0.12 });
        this.hiss({ dur: 0.4, gain: 0.1 * v, freq: 600, sweepTo: 3600 });
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((freq, i) => {
          this.tone({ freq, type: 'triangle', dur: 0.34, gain: 0.24 * v, delay: i * 0.1 });
        });
        this.hiss({ dur: 0.5, gain: 0.08 * v, freq: 1200, sweepTo: 5200, delay: 0.2 });
        break;
      case 'lose':
        [523, 466, 392, 311].forEach((freq, i) => {
          this.tone({ freq, type: 'triangle', dur: 0.3, gain: 0.18 * v, delay: i * 0.11 });
        });
        break;
      case 'confetti':
        for (let i = 0; i < 6; i += 1) {
          this.hiss({
            dur: 0.12,
            gain: 0.06 * v,
            freq: 1800 + Math.random() * 2600,
            delay: i * 0.05,
            q: 2,
          });
        }
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Trilha
  // -------------------------------------------------------------------------

  setMood(mood: MusicMood): void {
    if (this.mood === mood) return;
    this.mood = mood;
    if (mood === 'none') {
      this.stopScheduler();
      return;
    }
    if (this.settings.music && this.unlocked) this.startScheduler();
  }

  /** 0 = tranquilo, 1 = final de partida (acelera e abre o filtro). */
  setTension(value: number): void {
    this.tension = Math.max(0, Math.min(1, value));
    if (this.musicFilter && this.ctx) {
      const target = 1500 + this.tension * 3800;
      this.musicFilter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.4);
    }
  }

  private startScheduler(): void {
    const ctx = this.ensure();
    if (!ctx || this.schedulerId !== null) return;
    this.nextNoteTime = ctx.currentTime + 0.08;
    this.step = 0;
    const tick = (): void => {
      this.schedule();
      this.schedulerId = window.setTimeout(tick, 60);
    };
    tick();
  }

  private stopScheduler(): void {
    if (this.schedulerId !== null) {
      window.clearTimeout(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private get bpm(): number {
    switch (this.mood) {
      case 'match':
        return 128 + this.tension * 26;
      case 'lobby':
        return 104;
      default:
        return 96;
    }
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const stepTime = 60 / this.bpm / 4; // semicolcheia
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      this.emitStep(this.step, this.nextNoteTime);
      this.nextNoteTime += stepTime;
      this.step = (this.step + 1) % 64;
    }
  }

  private musicTone(options: {
    midi: number;
    time: number;
    dur: number;
    gain: number;
    type?: OscillatorType;
  }): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    osc.type = options.type ?? 'triangle';
    osc.frequency.value = midiToFreq(options.midi);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, options.time);
    env.gain.exponentialRampToValueAtTime(options.gain, options.time + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, options.time + options.dur);
    osc.connect(env);
    env.connect(bus);
    osc.start(options.time);
    osc.stop(options.time + options.dur + 0.02);
  }

  private musicNoise(options: { time: number; dur: number; gain: number; freq: number }): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = options.freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, options.time);
    env.gain.exponentialRampToValueAtTime(options.gain, options.time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, options.time + options.dur);
    src.connect(filter);
    filter.connect(env);
    env.connect(bus);
    src.start(options.time);
    src.stop(options.time + options.dur + 0.02);
  }

  /**
   * Progressão em Dó maior (I - vi - IV - V), pentatônica na melodia: soa
   * alegre e casual sem cansar em loop.
   */
  private emitStep(step: number, time: number): void {
    const bar = Math.floor(step / 16) % 4;
    const beat = step % 16;
    const roots = [48, 45, 41, 43];
    const root = roots[bar];
    const penta = [0, 2, 4, 7, 9, 12, 14, 16];

    if (this.mood === 'menu' || this.mood === 'lobby') {
      // acorde suave no começo de cada compasso
      if (beat === 0) {
        [0, 4, 7, 12].forEach((interval, i) => {
          this.musicTone({
            midi: root + 12 + interval,
            time: time + i * 0.012,
            dur: 1.5,
            gain: 0.05,
            type: 'sine',
          });
        });
      }
      // baixo nas cabeças
      if (beat === 0 || beat === 8) {
        this.musicTone({ midi: root, time, dur: 0.34, gain: 0.1, type: 'triangle' });
      }
      // arpejo delicado
      if (beat % 4 === 2) {
        const note = root + 24 + penta[(step / 2 + bar) % penta.length];
        this.musicTone({ midi: note, time, dur: 0.24, gain: 0.045, type: 'sine' });
      }
      if (this.mood === 'lobby' && beat % 8 === 4) {
        this.musicNoise({ time, dur: 0.05, gain: 0.02, freq: 6000 });
      }
      return;
    }

    if (this.mood === 'match') {
      const drive = 0.06 + this.tension * 0.05;
      // baixo pulsante
      if (beat % 4 === 0 || beat % 8 === 6) {
        this.musicTone({ midi: root, time, dur: 0.2, gain: 0.11, type: 'square' });
      }
      // kick
      if (beat === 0 || beat === 8) {
        this.musicTone({ midi: 28, time, dur: 0.16, gain: 0.16, type: 'sine' });
      }
      // hats
      if (beat % 2 === 1) {
        this.musicNoise({ time, dur: 0.035, gain: 0.018 + this.tension * 0.02, freq: 7000 });
      }
      if (beat === 4 || beat === 12) {
        this.musicNoise({ time, dur: 0.09, gain: 0.05, freq: 2200 });
      }
      // riff
      if (beat % 2 === 0) {
        const note = root + 24 + penta[(step + bar * 3) % penta.length];
        this.musicTone({ midi: note, time, dur: 0.13, gain: drive, type: 'triangle' });
      }
      // tensão alta: contracanto agudo
      if (this.tension > 0.55 && beat % 8 === 5) {
        const note = root + 36 + penta[(step + 2) % penta.length];
        this.musicTone({ midi: note, time, dur: 0.1, gain: 0.04, type: 'square' });
      }
    }
  }
}

export const sound = new SoundManager();
