/**
 * All audio is synthesised at runtime with the Web Audio API — no audio files.
 * Music is a gentle generative loop on a pentatonic scale.
 */
export type Sfx = 'click' | 'place' | 'upgrade' | 'error' | 'coin' | 'research' | 'achievement' | 'event' | 'era' | 'demolish' | 'built';

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

// Chord roots (I–vi–IV–V in C) with pentatonic melody pool.
const CHORDS = [
  [48, 52, 55, 60],
  [45, 52, 57, 60],
  [41, 48, 53, 57],
  [43, 50, 55, 59],
];
const MELODY = [72, 74, 76, 79, 81, 84, 76, 79];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private musicTimer = 0;
  private nextNoteTime = 0;
  private step = 0;
  private musicVol = 0.5;
  private sfxVol = 0.7;
  private lastSfx = new Map<Sfx, number>();

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.setVolumes(this.musicVol, this.sfxVol);
    this.nextNoteTime = this.ctx.currentTime + 0.3;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 100);
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(music * 0.22, this.ctx.currentTime, 0.1);
    this.sfxBus.gain.setTargetAtTime(sfx * 0.5, this.ctx.currentTime, 0.05);
  }

  suspend(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, bus: GainNode, glide?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private thump(start: number, vol: number, cutoff = 600): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(start);
    src.stop(start + 0.2);
  }

  play(s: Sfx): void {
    if (!this.ctx || this.sfxVol <= 0) return;
    const now = this.ctx.currentTime;
    const last = this.lastSfx.get(s) ?? 0;
    if (now - last < 0.05) return; // de-duplicate bursts
    this.lastSfx.set(s, now);
    const b = this.sfxBus;
    switch (s) {
      case 'click':
        this.tone(880, now, 0.05, 'square', 0.08, b);
        break;
      case 'place':
        this.thump(now, 0.8, 500);
        this.tone(220, now, 0.12, 'triangle', 0.3, b, 140);
        break;
      case 'built':
        this.tone(523, now, 0.1, 'triangle', 0.2, b);
        this.tone(784, now + 0.08, 0.16, 'triangle', 0.2, b);
        break;
      case 'upgrade':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, now + i * 0.06, 0.14, 'triangle', 0.2, b));
        break;
      case 'error':
        this.tone(180, now, 0.16, 'sawtooth', 0.12, b, 120);
        break;
      case 'coin':
        this.tone(988, now, 0.06, 'square', 0.12, b);
        this.tone(1319, now + 0.06, 0.18, 'square', 0.12, b);
        break;
      case 'research':
        [659, 784, 988].forEach((f, i) => this.tone(f, now + i * 0.09, 0.25, 'sine', 0.22, b));
        break;
      case 'achievement':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, now + i * 0.08, 0.3, 'triangle', 0.22, b));
        break;
      case 'event':
        this.tone(392, now, 0.25, 'sine', 0.25, b);
        this.tone(523, now + 0.15, 0.35, 'sine', 0.25, b);
        break;
      case 'era':
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, now + i * 0.12, 0.5, 'triangle', 0.25, b));
        this.tone(131, now, 1.2, 'sine', 0.3, b);
        break;
      case 'demolish':
        this.thump(now, 1, 300);
        this.thump(now + 0.08, 0.6, 250);
        break;
    }
  }

  /** Look-ahead scheduler for the generative soundtrack. */
  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || this.musicVol <= 0 || ctx.state !== 'running') return;
    const beat = 60 / 76 / 2; // eighth notes at 76 bpm
    while (this.nextNoteTime < ctx.currentTime + 0.3) {
      const t = this.nextNoteTime;
      const bar = Math.floor(this.step / 8) % CHORDS.length;
      const pos = this.step % 8;
      const chord = CHORDS[bar];
      if (pos === 0) {
        // Soft pad
        for (const n of chord) this.tone(midi(n), t, beat * 8, 'sine', 0.05, this.musicBus);
        this.tone(midi(chord[0] - 12), t, beat * 6, 'triangle', 0.08, this.musicBus);
      }
      // Arpeggio
      if (pos % 2 === 0) this.tone(midi(chord[(pos / 2) % chord.length] + 12), t, beat * 1.8, 'triangle', 0.035, this.musicBus);
      // Sparse melody with deterministic-ish variation
      const r = Math.sin(this.step * 12.9898) * 43758.5453;
      if ((pos === 3 || pos === 6) && r - Math.floor(r) > 0.45) {
        const note = MELODY[Math.floor((r - Math.floor(r)) * MELODY.length)];
        this.tone(midi(note), t, beat * 3, 'sine', 0.05, this.musicBus);
      }
      this.step++;
      this.nextNoteTime += beat;
    }
  }

  dispose(): void {
    clearInterval(this.musicTimer);
    void this.ctx?.close();
  }
}
