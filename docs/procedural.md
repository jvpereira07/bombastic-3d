# Engine de geração procedural

Código em `src/engine/procedural/` — genérico, não conhece o jogo. Quem usa hoje: o esgoto
(`src/game/world/Sewer.ts`), que gera uma masmorra nova a cada descida pela tampa.

## Peças

| Arquivo | Papel |
|---|---|
| `TileGrid.ts` | Grade de células (`Void`, `Floor`, `Water`, `Bridge`); fora da grade é `Void`. `carve()` só escreve em `Void`, então corredor não apaga sala. |
| `DungeonGenerator.ts` | `generateDungeon(seed, opções)` → `DungeonLayout` (grade, salas, sala de entrada, sala do chefe). Tudo sai de `seededRng(seed)`: mesma semente, mesma masmorra em qualquer máquina. |
| `TileMesher.ts` | `meshTileGrid(grade, estilo, materiais)` → `THREE.Group` com 3 malhas (chão, paredes, água). Paredes só nas bordas entre andável e `Void`; o canal ganha bordas do nível da água ao chão. UV em unidades de célula, então as texturas repetem sem emenda. |

## Algoritmo da masmorra

1. A sala do chefe é posicionada primeiro; as salas comuns são sorteadas sem encostar umas nas outras (folga de 2 células).
2. A entrada é a sala mais distante do chefe.
3. Uma árvore geradora mínima (Prim) liga todas as salas e garante caminho da entrada ao chefe; laços extras criam rotas alternativas (nunca para a sala do chefe, que tem uma porta só).
4. Corredores em L de 3 células: o centro vira canal de água, com uma ponte a cada 5 células.

## Custo

Cada geração cria 3 geometrias, com poucas draw calls independentemente do tamanho. Ao regenerar,
as geometrias antigas são liberadas com `disposeMeshes` e os materiais são reaproveitados.
As luzes do esgoto são fixas (uma tocha que segue o jogador e uma na arena), então trocar a
masmorra não recompila shaders.

## Multiplayer

A semente é o estado inteiro da masmorra: basta o dono do shard do esgoto escolher a semente
e enviá-la aos outros clientes, que geram a mesma geometria localmente.
