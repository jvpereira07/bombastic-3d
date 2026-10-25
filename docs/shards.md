# Shards do mundo

Status: adotado · Data: 2026-10-25

## Contexto

A superfície passou a ter 440 m x 440 m com quatro biomas. Desenhar e simular tudo a cada
quadro não escala, e o próximo passo do jogo é multiplayer, que precisa de (1) mundo idêntico
em todo cliente e (2) um jeito de cada cliente receber só o estado do que está perto dele.

## Decisão

O mundo é dividido em **shards**: quadrados de 55 m numa grade 8 x 8 sobre a superfície,
com id `"sx,sz"`. O esgoto é um shard à parte, `"sewer"` (uma instância fora da grade).
Código: `src/game/world/shards.ts` (grade e ids) e `src/game/world/ShardManager.ts` (raios).

| Papel | Como o shard é usado |
|---|---|
| Geração | Terreno e cenário de cada shard vêm só de `hashSeed(WORLD_SEED, sx, sz)` (`src/engine/rng.ts`). Mesmo id ⇒ mesmo shard em qualquer máquina. Normais e UV usam coordenadas de mundo, então não há emenda visível entre shards. |
| Render | Cada shard é um `THREE.Group`. Só os shards até `VIEW_RADIUS` (4) do jogador ficam visíveis; a neblina termina antes dessa borda para esconder a troca. |
| Simulação | Entidades com posição só rodam `update` se o shard delas está até `SIM_RADIUS` (2). Longe disso ficam congeladas. Projéteis e efeitos (sem `position`) sempre rodam. |
| Rede (futuro) | `ShardManager.onEnter/onLeave` dispara quando um shard entra/sai do raio de simulação: é onde o cliente assina/cancela o canal daquele shard. Cada shard pode ter um dono autoritativo (servidor ou host) que simula as entidades dele. |

## Consequências

- Trocar de shard é barato: só recalcula conjuntos de ids e liga/desliga grupos.
- Todo conteúdo novo da superfície deve ser gerado a partir da semente do shard, nunca de
  `Math.random()`; senão os clientes divergem. Gameplay (ratos, drops, IA) ainda usa
  `Math.random()` e, no multiplayer, deve rodar só no dono do shard e ser replicado.
- As texturas de pixel art procedurais (árvores etc.) ainda variam por cliente; isso é só
  visual e não afeta colisão nem posições.
- Entidade que atravessa a borda passa a pertencer ao novo shard automaticamente, porque o
  shard é calculado pela posição a cada quadro (no multiplayer, isso vira um handoff de dono).
