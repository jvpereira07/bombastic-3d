export interface ToneOptions {
  f?: number; f2?: number | null; type?: OscillatorType; dur?: number; vol?: number; delay?: number; out?: AudioNode | null;
}
export interface NoiseOptions {
  dur?: number; vol?: number; freq?: number; f2?: number | null; type?: BiquadFilterType; q?: number; delay?: number;
}

/** Síntese simples com Web Audio. O contexto só nasce depois de um gesto do usuário. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private readonly volume = 0.35;

  constructor() {
    const unlock = (): void => { this.context(); };
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });
  }

  get isMuted(): boolean { return this.muted; }
  get now(): number { return this.ctx?.currentTime ?? 0; }

  context(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : this.volume;
        this.masterGain.connect(this.ctx.destination);
      } catch { return null; }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  get master(): AudioNode | null { this.context(); return this.masterGain; }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.context();
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  tone({ f = 440, f2 = null, type = 'square', dur = 0.1, vol = 0.2, delay = 0, out = null }: ToneOptions): void {
    const ctx = this.context(); const master = this.masterGain;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(out ?? master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  noise({ dur = 0.2, vol = 0.25, freq = 1200, f2 = null, type = 'bandpass', q = 1, delay = 0 }: NoiseOptions): void {
    const ctx = this.context(); const master = this.masterGain;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = this.noiseBuffer;
    filter.type = type; filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (f2) filter.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  /** Som contínuo (oscilador com vibrato); devolve a função que para. */
  drone(freq: number, vibratoHz: number, vibratoDepth: number, vol: number, type: OscillatorType = 'sawtooth'): () => void {
    const ctx = this.context(); const master = this.masterGain;
    if (!ctx || !master) return () => undefined;
    const osc = ctx.createOscillator(), lfo = ctx.createOscillator(), lfoGain = ctx.createGain(), gain = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    lfo.frequency.value = vibratoHz; lfoGain.gain.value = vibratoDepth;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.value = vol;
    osc.connect(gain).connect(master);
    osc.start(); lfo.start();
    return () => { try { osc.stop(); lfo.stop(); } catch { /* já parado */ } };
  }
}
