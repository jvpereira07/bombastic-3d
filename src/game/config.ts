import * as THREE from 'three';

/** Esgoto: área separada do mapa, centrada em x = SX. */
export const SEWER = {
  SX: 1000,         // centro em x
  SW: 16,           // meia-largura do túnel
  SL: 40,           // meia-comprimento do túnel (o canal vai de -SL a SL)
  CH: 3.5,          // meia-largura do canal de água
  WATER_Y: -0.45,
  AL: 36,           // comprimento da arena do chefe (de SL a SL + AL)
  WALL_H: 12,
} as const;

export const OVERWORLD = { HALF: 95, SIZE: 220 } as const;

export const PHYSICS = { GRAVITY: 30 } as const;

export const PLAYER = {
  SPEED: 9, JUMP: 11, MAX_HP: 100, MAX_STAMINA: 100, STAMINA_REGEN: 12,
  ATTACK_TIME: 0.36, HURT_TIME: 0.5, RESPAWN_TIME: 2.5,
  DASH_TIME: 0.3, DASH_COST: 20, DASH_COOLDOWN: 0.8, DASH_SPEED: 2.8,
  SPRITE_SIZE: 2.6, SLASH_KNOCKBACK: 28,
} as const;

export const RAT = { SIGHT: 20, LOSE: 28, POUNCE_RANGE: 3.5, POUNCE_COOLDOWN: 1.4, DAMAGE: 12, HP: 3, POTION_DROP: 0.2 } as const;

export const GATOR = {
  HP: 6, SIGHT: 24, SPIT_COOLDOWN: 2.2, SPIT_ANIM: 0.5, SPIT_WINDUP: 0.3, SPIT_SPEED: 13, SPIT_LIFE: 2.5, DAMAGE: 10,
} as const;

export const BOSS = {
  HP: 60, CENTER: new THREE.Vector3(SEWER.SX, 0, SEWER.SL + SEWER.AL * 0.6), RADIUS: 6, SPEED: 6.5,
  MAX_MINIONS: 8, CONTACT_DAMAGE: 15,
} as const;

/** Linhas de todas as folhas de personagens. */
export const ROW = { BACK: 0, LEFT: 1, FRONT: 2, RIGHT: 3 } as const;
