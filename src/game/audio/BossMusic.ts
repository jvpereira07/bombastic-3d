import type { AudioEngine } from '../../engine/AudioEngine';

const BPM = 150;
const BASS = [110, 110, 131, 98, 110, 110, 147, 131];
const ARP = [440, 523, 659, 523, 392, 494, 587, 494];

/** Música da luta: baixo + arpejo + chimbal, agendada um pouco à frente do tempo real. */
export class BossMusic {
  private playing = false;
  private step = 0;
  private next = 0;
  private gain: GainNode | null = null;

  constructor(private readonly audio: AudioEngine) {}

  set(on: boolean): void {
    if (on === this.playing) return;
    this.playing = on;
    const ctx = this.audio.context(), master = this.audio.master;
    if (!ctx || !master) return;
    if (!this.gain) { this.gain = ctx.createGain(); this.gain.connect(master); }
    this.gain.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.3);
    if (on) { this.next = ctx.currentTime + 0.05; this.step = 0; }
  }

  update(): void {
    if (!this.playing || !this.gain) return;
    const now = this.audio.now;
    while (this.next < now + 0.15) {
      const delay = this.next - now, i = this.step % 32, bar = Math.floor(i / 4) % 8;
      if (i % 2 === 0) this.audio.tone({ f: BASS[bar]!, type: 'triangle', dur: 0.2, vol: 0.22, delay, out: this.gain });
      this.audio.tone({ f: ARP[(bar + i) % 8]! * (i % 8 < 4 ? 1 : 1.5), type: 'square', dur: 0.09, vol: 0.05, delay, out: this.gain });
      if (i % 4 === 2) this.audio.noise({ dur: 0.05, freq: 6000, type: 'highpass', vol: 0.08, delay });
      this.step++;
      this.next += 60 / BPM / 2;
    }
  }
}
