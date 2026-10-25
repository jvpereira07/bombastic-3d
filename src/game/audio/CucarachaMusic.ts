import type { AudioEngine } from '../../engine/AudioEngine';

/** Andamento do MIDI de referência (344807 µs por semínima ≈ 174 BPM). */
const BPM = 174;
/** Tamanho do loop em semicolcheias: 24 compassos 4/4 (A, A e a ponte). */
const LOOP = 384;

/** [início, duração] em semicolcheias e a nota MIDI. */
type Note = [number, number, number];

// Trompete 1 (melodia) e baixo do La-Cucaracha.mid, compassos 9 a 32, quantizados em semicolcheias.
const MELODY: Note[] = [
  [10, 1, 62], [12, 1, 62], [14, 1, 62], [16, 6, 67], [22, 2, 71], [50, 1, 67], [54, 1, 66], [56, 2, 67], [58, 1, 66], [60, 2, 67],
  [62, 2, 68], [64, 8, 69], [74, 1, 62], [76, 1, 62], [78, 1, 62], [80, 5, 66], [86, 1, 69], [114, 1, 74], [118, 2, 76], [120, 2, 74],
  [122, 2, 72], [124, 2, 71], [126, 2, 69], [128, 7, 71], [138, 1, 62], [140, 1, 62], [142, 1, 62], [144, 6, 67], [150, 1, 71], [178, 1, 67],
  [182, 1, 66], [184, 2, 67], [186, 2, 66], [188, 2, 67], [190, 2, 68], [192, 7, 69], [202, 1, 62], [204, 1, 62], [206, 1, 62], [208, 5, 66],
  [214, 2, 69], [242, 1, 74], [246, 2, 76], [248, 2, 74], [250, 2, 72], [252, 2, 71], [254, 2, 69], [256, 1, 67], [258, 4, 62], [264, 2, 67],
  [268, 1, 71], [272, 6, 74], [278, 9, 71], [290, 5, 74], [296, 2, 76], [298, 2, 74], [300, 2, 72], [302, 2, 71], [304, 6, 72], [310, 6, 69],
  [322, 5, 62], [328, 1, 66], [332, 1, 69], [336, 6, 72], [342, 8, 69], [354, 2, 74], [358, 2, 76], [360, 2, 74], [362, 2, 72], [364, 2, 71],
  [366, 2, 69], [368, 6, 71], [374, 7, 67],
];
const BASS: Note[] = [
  [0, 5, 38], [16, 4, 43], [22, 1, 43], [24, 7, 38], [32, 5, 43], [38, 1, 43], [40, 6, 38], [48, 4, 43], [54, 1, 43], [56, 3, 38],
  [60, 3, 43], [64, 5, 45], [70, 2, 45], [72, 6, 38], [80, 5, 45], [86, 2, 45], [88, 6, 38], [96, 4, 45], [102, 2, 45], [104, 6, 38],
  [112, 5, 45], [118, 2, 45], [120, 7, 38], [128, 4, 43], [132, 3, 42], [136, 3, 40], [140, 4, 38], [144, 4, 43], [150, 2, 43], [152, 7, 38],
  [160, 5, 43], [166, 2, 43], [168, 6, 38], [176, 4, 43], [182, 1, 43], [184, 7, 38], [192, 5, 45], [198, 1, 45], [200, 6, 38], [208, 5, 45],
  [214, 2, 45], [216, 6, 38], [224, 4, 45], [230, 1, 45], [232, 8, 38], [240, 4, 45], [246, 1, 45], [248, 7, 38], [256, 3, 43], [272, 4, 43],
  [278, 1, 43], [280, 7, 38], [288, 5, 43], [294, 2, 43], [296, 4, 38], [300, 4, 43], [304, 5, 45], [310, 2, 45], [312, 8, 38], [320, 4, 45],
  [326, 2, 45], [328, 8, 38], [336, 5, 45], [342, 2, 45], [344, 7, 38], [352, 4, 45], [358, 2, 45], [360, 8, 38], [368, 4, 43], [372, 4, 42],
  [376, 3, 40], [380, 3, 38],
];

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Notas indexadas pela semicolcheia em que começam. */
function byStep(notes: Note[]): Map<number, Note[]> {
  const map = new Map<number, Note[]>();
  for (const n of notes) map.set(n[0], [...(map.get(n[0]) ?? []), n]);
  return map;
}
const MELODY_AT = byStep(MELODY);
const BASS_AT = byStep(BASS);

/** "La cucaracha, la cucaracha…" em 8 bits no ritmo do MIDI: melodia quadrada, baixo triangular e chocalho. */
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
    const now = this.audio.now, sixteenth = 60 / BPM / 4;
    while (this.next < now + 0.15) {
      const delay = this.next - now, i = this.step % LOOP;
      for (const [, len, midi] of MELODY_AT.get(i) ?? []) {
        this.audio.tone({ f: hz(midi), type: 'square', dur: len * sixteenth * 0.92, vol: 0.07, delay, out: this.gain });
      }
      for (const [, len, midi] of BASS_AT.get(i) ?? []) {
        this.audio.tone({ f: hz(midi), type: 'triangle', dur: len * sixteenth * 0.9, vol: 0.22, delay, out: this.gain });
      }
      if (i % 4 === 2) this.audio.noise({ dur: 0.04, freq: 7000, type: 'highpass', vol: 0.06, delay }); // maraca no contratempo
      this.step++;
      this.next += sixteenth;
    }
  }
}
