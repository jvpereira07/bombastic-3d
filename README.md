# Bombastic 3D

Versão 3D (Three.js + TypeScript + Vite) do [bombastic-pygame](https://github.com/jvpereira07/bombastic-pygame), usando as mesmas mídias.

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm run build      # checa tipos e gera dist/
npm run preview    # serve o dist/
```

## Controles

| Tecla | Ação |
|---|---|
| Clique | trava o mouse na câmera; com o mouse travado, ataca |
| WASD / setas | anda (relativo à câmera) |
| Espaço | pula |
| F ou J | ataca (corte em projétil, combo de 3) |
| Q ou 1 | bebe poção |
| Shift | dash (precisa do Chapéu do Ligeirinho) |
| E | usa a tampa do esgoto |
| M | liga/desliga o som |
| Roda do mouse | zoom |

## Estrutura

```
src/
  main.ts                 inicialização: carrega imagens, cria Engine e Game
  assets.ts               índice das imagens de src/assets (import.meta.glob)
  engine/                 genérico, não conhece o jogo
    Engine.ts             renderer, cena, câmera, laço principal (System.update)
    Assets.ts             pré-carrega texturas; entrega clones, pixel art e tiles
    SpriteSheet.ts        folha em grade com quadro/espelhamento por instância
    Billboard.ts          sprite que encara a câmera
    Input.ts              teclado, pointer lock, arrastar, roda
    ThirdPersonCamera.ts  órbita suave que não atravessa chão nem paredes
    AudioEngine.ts        síntese Web Audio (tom, ruído, drone)
    math.ts               utilitários (rnd, damp, facingRow…)
  game/
    Game.ts               orquestra tudo; serviços para as entidades (spawn, explode, dropItem…)
    config.ts             constantes de balanceamento e dimensões
    RatSpawner.ts         população e renascimento dos ratos
    world/                World (zonas, chão, limites, clima), Overworld, Sewer, ManholeCover, pixelArt
    entities/             Entity, Actor, Player, Rat, BombRat, SlashProjectile, Explosion, Pickup
    boss/                 MrKabumstic, SpeakerLaser, MusicNote, RatPlane, Paratrooper
    items/                items.ts (definições) e Inventory
    ui/Hud.ts             barras, slots, faixa de aviso, barra do chefe
    audio/                Sfx (efeitos) e BossMusic (sequenciador)
scripts/build_assets.py   gera src/assets a partir do repositório pygame
```

### Ideias principais

- **Engine x jogo:** `src/engine` não importa nada de `src/game`. O jogo se pluga como um `System` (`engine.add(game)`).
- **Entidades:** tudo que vive no mundo estende `Entity` (`update`, `dispose`, `alive`). Criaturas com corpo estendem `Actor` (física, vida, direção do sprite, piscar de dano). O que pode levar golpe implementa `Hittable`.
- **Itens:** `ITEMS` define consumíveis (`use`) e equipamentos (`grants`, `layer`). `Inventory` guarda as pilhas, e o `Player` pergunta `hasAbility('dash')` em vez de conhecer o chapéu.
- **Folhas de sprite:** todas usam as linhas 0 costas, 1 esquerda, 2 frente, 3 direita; `facingRow()` escolhe a linha pela câmera.

## Mídias

Sprites e tiles vêm de `bombastic-pygame/assets/images`. Para regenerar `src/assets`:

```bash
python3 scripts/build_assets.py ../bombastic-pygame
```

O projeto original não tem áudio; os sons são sintetizados em `game/audio`.
