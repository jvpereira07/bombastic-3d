import type { AudioEngine } from '../../engine/AudioEngine';
import { rnd } from '../../engine/math';

const PENTATONIC = [523, 587, 659, 784, 880];

/** Efeitos 8-bit do jogo (o projeto original não tem arquivos de áudio). */
export class Sfx {
  private lastNote = 0;
  constructor(private readonly audio: AudioEngine) {}

  maraca(): void {
    for (let i = 0; i < 4; i++) this.audio.noise({ dur: 0.06, freq: 5200, f2: 3800, vol: 0.18, q: 1.2, delay: i * 0.07 });
  }
  /** Puxando a corda do arco: rangido subindo. */
  bowDraw(): void { this.audio.tone({ f: 180, f2: 320, type: 'sawtooth', dur: 0.3, vol: 0.05 }); }
  /** Corda no máximo: tic agudo. */
  bowFull(): void { this.audio.tone({ f: 1400, dur: 0.05, vol: 0.07 }); }
  /** Flecha solta: estalo da corda + zunido. */
  bowShot(): void {
    this.audio.tone({ f: 520, f2: 140, type: 'triangle', dur: 0.12, vol: 0.18 });
    this.audio.noise({ dur: 0.18, freq: 4000, f2: 1200, vol: 0.12, q: 0.7 });
  }
  /** Batida de asa: sopro grave e curto. */
  flap(): void { this.audio.noise({ dur: 0.12, freq: 500, f2: 180, vol: 0.12, q: 0.6 }); }
  slash(): void { this.audio.noise({ dur: 0.13, freq: 3000, f2: 700, vol: 0.22, q: 0.8 }); }
  /** "!" de um mob que notou o jogador: dois bipes subindo. */
  alert(): void {
    this.audio.tone({ f: 880, dur: 0.06, vol: 0.06 });
    this.audio.tone({ f: 1320, dur: 0.09, vol: 0.06, delay: 0.06 });
  }
  hit(): void { this.audio.tone({ f: 240, f2: 90, dur: 0.09, vol: 0.2 }); }
  hurt(): void { this.audio.tone({ f: 320, f2: 70, type: 'sawtooth', dur: 0.28, vol: 0.2 }); }
  squeak(): void {
    this.audio.tone({ f: 1700, f2: 2700, type: 'sine', dur: 0.09, vol: 0.1 });
    this.audio.tone({ f: 2200, f2: 1500, type: 'sine', dur: 0.07, vol: 0.08, delay: 0.08 });
  }
  boom(): void {
    this.audio.noise({ dur: 0.7, freq: 900, f2: 60, type: 'lowpass', vol: 0.6 });
    this.audio.tone({ f: 90, f2: 30, type: 'sine', dur: 0.5, vol: 0.5 });
  }
  note(): void {
    const now = performance.now();
    if (now - this.lastNote < 70) return;
    this.lastNote = now;
    this.audio.tone({ f: PENTATONIC[(Math.random() * 5) | 0]!, type: 'triangle', dur: 0.16, vol: 0.1 });
  }
  private arpeggio(freqs: number[], type: OscillatorType, dur: number, vol: number, step: number): void {
    freqs.forEach((f, i) => this.audio.tone({ f, type, dur, vol, delay: i * step }));
  }
  potion(): void { this.arpeggio([392, 523, 659, 784], 'square', 0.09, 0.12, 0.06); }
  pickup(): void { this.arpeggio([660, 880, 1320], 'square', 0.08, 0.12, 0.07); }
  coin(): void { this.arpeggio([1318, 1760], 'square', 0.06, 0.08, 0.05); }
  buy(): void { this.arpeggio([523, 784, 1046, 1568], 'triangle', 0.1, 0.14, 0.06); }
  denied(): void { this.audio.tone({ f: 220, f2: 140, type: 'square', dur: 0.18, vol: 0.12 }); }
  hat(): void { this.arpeggio([523, 659, 784, 1046, 1318], 'triangle', 0.14, 0.16, 0.08); }
  dash(): void { this.audio.noise({ dur: 0.22, freq: 600, f2: 3500, vol: 0.2, q: 0.6 }); }
  jump(): void { this.audio.tone({ f: 280, f2: 620, type: 'square', dur: 0.12, vol: 0.09 }); }
  manhole(): void {
    this.audio.tone({ f: 180, f2: 50, type: 'square', dur: 0.35, vol: 0.15 });
    this.audio.noise({ dur: 0.3, freq: 300, type: 'lowpass', vol: 0.2 });
  }
  drip(): void { this.audio.tone({ f: rnd(900, 1400), f2: rnd(1800, 2400), type: 'sine', dur: 0.07, vol: 0.05 }); }
  laserCharge(): void { this.audio.tone({ f: 120, f2: 900, type: 'sawtooth', dur: 0.7, vol: 0.12 }); }
  laserHum(): () => void { return this.audio.drone(110, 18, 25, 0.12); }
  bossDie(): void { this.arpeggio([784, 659, 523, 392, 262], 'square', 0.2, 0.15, 0.14); this.boom(); }
}
