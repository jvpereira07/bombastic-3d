/**
 * Protocolo do modo online (JSON por WebSocket), compartilhado entre o cliente (src/net) e o servidor (server/).
 * O servidor é a autoridade de quem está conectado, em que shard cada um está, da semente do esgoto e de
 * quem é o dono de cada shard. Cada cliente simula o próprio jogador e os mobs dos shards de que é dono,
 * e manda esses estados ~15 vezes por segundo; os outros clientes só desenham (mobs fantoche).
 */
export const NET = {
  PORT: 8787,
  TICK_HZ: 15,
  /** Atraso de interpolação dos jogadores remotos (s): suaviza a rede às custas de um pouco de latência. */
  INTERP_DELAY: 0.12,
  /** Raio de interesse em shards: só recebe estado de quem está até aqui (o esgoto só vê o esgoto). */
  INTEREST_RADIUS: 3,
  NAME_MAX: 16,
} as const;

/** Folha usada no quadro atual; a linha (direção) cada cliente calcula pela própria câmera. */
export type PoseSheet = 'move' | 'attack' | 'maraca' | 'dash';

export interface PlayerState {
  p: [number, number, number];   // posição
  d: [number, number];           // direção que olha (x, z)
  sheet: PoseSheet;
  col: number;                   // coluna da folha
  hat: boolean;
  dead: boolean;
}

export type MobKind = 'rat' | 'bomb' | 'gator';

/** Estado de um mob simulado pelo dono do shard. `s`/`c` = pose (folha/coluna) própria de cada tipo. */
export interface MobState {
  id: string;
  k: MobKind;
  p: [number, number, number];
  d: [number, number];
  hp: number;
  s: number;
  c: number;
  h: boolean;          // piscando de dano
  m: boolean;          // lacaio do chefe
}

export interface RemotePlayerInfo { id: string; name: string; state: PlayerState | null }

export type ClientMessage =
  | { t: 'hello'; name: string }
  | { t: 'state'; s: PlayerState }
  /** Pede a semente do esgoto: entra na masmorra de quem já está lá, ou numa nova. */
  | { t: 'sewer'; req: number }
  /** Mobs que este cliente simula agora (lista completa: quem sumiu dela morreu ou mudou de dono). */
  | { t: 'mobs'; list: MobState[] }
  /** Golpe num mob que outro cliente simula; o servidor entrega a quem simula. */
  | { t: 'hit'; id: string; dir: [number, number, number] }
  /** Dano de um mob meu num jogador remoto. */
  | { t: 'hurt'; to: string; dmg: number; dir: [number, number, number] }
  /** Efeito só visual para quem está perto (ex.: explosão). */
  | { t: 'fx'; k: 'boom'; p: [number, number, number] };

export type ServerMessage =
  | { t: 'welcome'; id: string; worldSeed: number; players: RemotePlayerInfo[] }
  | { t: 'join'; id: string; name: string }
  | { t: 'leave'; id: string }
  /** Estados de quem está no seu raio de interesse; quem saiu do raio some (`gone`). */
  | { t: 'states'; list: { id: string; s: PlayerState }[]; gone: string[] }
  | { t: 'sewer'; req: number; seed: number; fresh: boolean }
  /** Dono de cada shard no seu raio de interesse (só quando muda). */
  | { t: 'owners'; owners: Record<string, string> }
  | { t: 'mobs'; list: MobState[]; gone: string[] }
  | { t: 'hit'; id: string; dir: [number, number, number] }
  | { t: 'hurt'; dmg: number; dir: [number, number, number] }
  | { t: 'fx'; k: 'boom'; p: [number, number, number] };
