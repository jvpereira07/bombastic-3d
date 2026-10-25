import type { AudioEngine } from '../../engine/AudioEngine';

const BPM = 176;
const C4 = 262, D4 = 294, E4 = 330, F4 = 349, G4 = 392, A4 = 440, Bb4 = 466, C5 = 523, D5 = 587;
const F2 = 87, C3 = 131, C2 = 65, G2 = 98;

/** Frases de La Cucaracha: [nota (0 = pausa), colcheias] e o acorde (tônica, quinta) do oom-pah. */
const PHRASES: { notes: [number, number][]; chord: [number, number] }[] = [
  { notes: [[C4, 1], [C4, 1], [C4, 1], [F4, 3], [A4, 2], [0, 2]], chord: [F2, C3] },
  { notes: [[C4, 1], [C4, 1], [C4, 1], [F4, 3], [A4, 2], [0, 2]], chord: [F2, C3] },
  { notes: [[F4, 1], [F4, 1], [E4, 1], [E4, 1], [D4, 1], [D4, 1], [C4, 4]], chord: [C2, G2] },
  { notes: [[C4, 1], [C4, 1], [C4, 1], [E4, 3], [G4, 2], [0, 2]], chord: [C2, G2] },
  { notes: [[C4, 1], [C4, 1], [C4, 1], [E4, 3], [G4, 2], [0, 2]], chord: [C2, G2] },
  { notes: [[C5, 2], [D5, 1], [C5, 1], [Bb4, 1], [A4, 1], [G4, 1], [F4, 4], [0, 1]], chord: [F2, C3] },
];

interface Step { note: number; len: number; chord: [number, number] }

/** Uma colcheia por passo: nota que começa nele (ou 0) e o acorde vigente. */
const STEPS: Step[] = PHRASES.flatMap(({ notes, chord }) =>
  notes.flatMap(([note, len]) => [{ note, len, chord }, ...Array.from({ length: len - 1 }, () => ({ note: 0, len: 0, chord }))]));

/** "La cucaracha, la cucaracha…" em 8 bits: melodia quadrada, baixo triangular oom-pah e chocalho. */
export class CucarachaMusic {
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
    this.gain.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, on ? 0.05 : 0.4);
    if (on) { this.next = ctx.currentTime + 0.05; this.step = 0; }
  }

  update(): void {
    if (!this.playing || !this.gain) return;
    const now = this.audio.now, eighth = 60 / BPM / 2;
    while (this.next < now + 0.15) {
      const delay = this.next - now, i = this.step % STEPS.length, s = STEPS[i]!;
      if (s.note) {
        this.audio.tone({ f: s.note, type: 'square', dur: s.len * eighth * 0.9, vol: 0.07, delay, out: this.gain });
        this.audio.tone({ f: s.note * 2, type: 'square', dur: 0.04, vol: 0.02, delay, out: this.gain }); // brilho do ataque
      }
      if (i % 2 === 0) this.audio.tone({ f: (i / 2) % 2 === 0 ? s.chord[0] : s.chord[1], type: 'triangle', dur: eighth * 1.6, vol: 0.2, delay, out: this.gain });
      else this.audio.noise({ dur: 0.04, freq: 7000, type: 'highpass', vol: 0.06, delay }); // maraca no contratempo
      this.step++;
      this.next += eighth;
    }
  }
}
