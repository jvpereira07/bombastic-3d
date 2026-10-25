/** Esgoto: masmorra procedural numa área separada do mapa, centrada em x = SX (ver world/Sewer.ts). */
export const SEWER = {
  SX: 1000,         // centro em x
  TILE: 4,          // metros por célula da grade
  GRID: 40,         // células por lado (160 m)
  WATER_Y: -0.45,
  WALL_H: 12,
} as const;

/** Superfície: grama no centro; deserto a leste, gelo ao norte e praia com mar ao sul. */
export const OVERWORLD = { HALF: 205, SIZE: 440, SEA_Y: -0.6 } as const;

export const PHYSICS = { GRAVITY: 30 } as const;

export const PLAYER = {
  SPEED: 9, JUMP: 11, MAX_HP: 100, MAX_STAMINA: 100, STAMINA_REGEN: 12,
  ATTACK_TIME: 0.36, HURT_TIME: 0.5, RESPAWN_TIME: 2.5,
  DASH_TIME: 0.3, DASH_COST: 20, DASH_COOLDOWN: 0.8, DASH_SPEED: 2.8,
  SPRITE_SIZE: 2.6, SLASH_KNOCKBACK: 28, DASH_KNOCKBACK: 24,
} as const;

/**
 * Combo de 3 golpes: apertar de novo no fim de um golpe (BUFFER, fração da animação) ou logo depois (WINDOW, s)
 * emenda o próximo; senão volta ao primeiro. Cada etapa tem dano, empurrão (x) e avanço (m/s) próprios.
 */
export const COMBO = {
  BUFFER: 0.45, WINDOW: 0.32, FINISHER_RECOVERY: 0.18,
  DAMAGE: [1, 1, 2], KNOCKBACK: [0.7, 0.9, 1.5], LUNGE: [4, 4.5, 8], SLASH_SIZE: [2.4, 2.4, 3.2],
} as const;

/** Mira assistida: sem trava, o golpe puxa para o inimigo mais próximo dentro do cone (graus) e do alcance. */
export const AIM_ASSIST = { CONE: 55, SWORD_RANGE: 7, MARACA_RANGE: 20 } as const;

/** Cucarachas: bando que dança em roda em volta do jogador, fechando a roda e dando botes. */
export const CUCARACHA = {
  HP: 2, DAMAGE: 8, SPEED: 9, SIGHT: 16, LOSE: 26, TROUPE: [4, 6] as [number, number],
  ORBIT_START: 6, ORBIT_MIN: 2.8, ORBIT_SHRINK: 0.35, SPIN: 1.2,
  LUNGE_SPEED: 15, LUNGE_TIME: 0.4, LUNGE_COOLDOWN: [2.5, 5] as [number, number],
  HOP: 4, HOP_EVERY: 60 / 176 * 2,
} as const;

export const RAT = { SIGHT: 20, LOSE: 28, POUNCE_RANGE: 3.5, POUNCE_COOLDOWN: 1.4, DAMAGE: 12, HP: 3, POTION_DROP: 0.2 } as const;

/** Maraca, arma de segunda mão trocável com a espada: atira ondas sonoras de longe (~24 m). */
export const MARACA = { TIME: 0.42, SPEED: 22, LIFE: 1.1, KNOCKBACK: 16, SIZE: 3.2 } as const;

export const GATOR = {
  HP: 6, SIGHT: 24, SPIT_COOLDOWN: 2.2, SPIT_ANIM: 0.5, SPIT_WINDUP: 0.3, SPIT_SPEED: 13, SPIT_LIFE: 2.5, DAMAGE: 10,
} as const;

export const BOSS = {
  HP: 60, RADIUS: 6, SPEED: 6.5,
  MAX_MINIONS: 8, CONTACT_DAMAGE: 15,
} as const;

/** Linhas de todas as folhas de personagens. */
export const ROW = { BACK: 0, LEFT: 1, FRONT: 2, RIGHT: 3 } as const;
