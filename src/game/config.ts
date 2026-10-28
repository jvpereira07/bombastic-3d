/** Esgoto: masmorra procedural numa área separada do mapa, centrada em x = SX (ver world/Sewer.ts). */
export const SEWER = {
  SX: 1000,         // centro em x
  TILE: 4,          // metros por célula da grade
  GRID: 132,        // células por lado (528 m): malha de 11x11 nós de 12 células
  WATER_Y: -0.45,
  WALL_H: 12,
} as const;

/** Superfície: grama no centro; deserto a leste, gelo ao norte e praia com mar ao sul. */
export const OVERWORLD = { HALF: 370, SIZE: 770, SEA_Y: -0.6 } as const;

export const PHYSICS = { GRAVITY: 30 } as const;

export const PLAYER = {
  SPEED: 9, JUMP: 11, AIR_JUMP: 10, BOUNCE: 17, MAX_HP: 100, MAX_STAMINA: 100, STAMINA_REGEN: 12,
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
export const AIM_ASSIST = { CONE: 55, SWORD_RANGE: 7, MARACA_RANGE: 20, BOW_RANGE: 32 } as const;

/** Cucarachas: bando que dança em roda em volta do jogador, fechando a roda e dando botes. */
export const CUCARACHA = {
  HP: 2, DAMAGE: 8, SPEED: 9, SIGHT: 16, LOSE: 26, TROUPE: [4, 6] as [number, number],
  ORBIT_START: 6, ORBIT_MIN: 2.8, ORBIT_SHRINK: 0.35, SPIN: 1.2,
  LUNGE_SPEED: 15, LUNGE_TIME: 0.4, LUNGE_COOLDOWN: [2.5, 5] as [number, number],
  HOP: 4, HOP_EVERY: 60 / 174 * 2, // pulinho a cada meio compasso da música
} as const;

export const RAT = { SIGHT: 20, LOSE: 28, POUNCE_RANGE: 3.5, POUNCE_COOLDOWN: 1.4, DAMAGE: 12, HP: 3, POTION_DROP: 0.2 } as const;

/** Maraca, arma de segunda mão trocável com a espada: atira ondas sonoras de longe (~24 m). */
/** Arco: puxa a corda (8 quadros) e solta a flecha perto do fim; sem combo. */
/**
 * Arco: segurar o ataque puxa a corda (DRAW s até a flecha encaixar) e carrega a força até CHARGE s;
 * soltar dispara. Tiro rápido sai fraco; carga cheia dá mais dano, velocidade e empurrão.
 * Mirando, anda devagar (AIM_SPEED) e a câmera chega perto (AIM_ZOOM).
 */
export const BOW = {
  DRAW: 0.3, CHARGE: 0.9, RELEASE: 0.22, AIM_SPEED: 0.4, AIM_ZOOM: 0.7,
  SPEED: [24, 44] as [number, number], DAMAGE: [1, 3] as [number, number], KNOCKBACK: [6, 16] as [number, number],
  LIFE: 1.1, SIZE: 1.4, AIM_RANGE: 60, LINGER: 0.7,
} as const;

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

/** Moedas que os inimigos derrubam ao morrer (quantidade sorteada entre MIN e MAX) e o ímã que puxa para o jogador. */
export const COIN = {
  DROP: { rat: [1, 2], gator: [3, 5], cucaracha: [1, 3] } as Record<'rat' | 'gator' | 'cucaracha', readonly [number, number]>,
  MAGNET: 3.5, PICK: 0.9, SPEED: 14,
} as const;

/**
 * Vendedores de poção em barraquinhas pelo mundo de cima. TALK = distância para falar (E);
 * OFFERS = pacotes de poções e preço em moedas; SPOTS = onde ficam as barracas (x, z);
 * vazio por enquanto (barracas desligadas). Lugares testados: [14, -12], [-62, 34], [58, 44], [-26, -70].
 */
export const VENDOR = {
  TALK: 3.6, SPRITE_SIZE: 3.2, FRAMES: 10, FPS: 8,
  OFFERS: [{ potions: 1, price: 10 }, { potions: 3, price: 25 }, { potions: 5, price: 40 }],
  SPOTS: [] as readonly (readonly [number, number])[],
} as const;
