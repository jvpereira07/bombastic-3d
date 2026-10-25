# Modo online

## Como rodar

```bash
npm run server        # servidor WebSocket na porta 8787
npm run start:online  # cliente em /?online, exposto na rede local (--host)
```

Parâmetros da URL: `?online` liga o modo online; `?name=Ana` escolhe o nome;
`?server=ws://192.168.0.10:8787` aponta para outro servidor. Sem servidor no endereço o jogo
roda normalmente, offline.

## Arquitetura

| Peça | Arquivo | Papel |
|---|---|---|
| Protocolo | `src/net/protocol.ts` | Mensagens JSON e constantes compartilhadas por cliente e servidor. |
| Servidor | `server/index.ts` | Quem está conectado, shard de cada um, semente do esgoto. A 15 Hz envia a cada cliente só os jogadores no raio de interesse dele. |
| Cliente | `src/net/NetClient.ts` | Conexão, envio do estado do jogador a 15 Hz e pedido da semente do esgoto. |
| Jogadores remotos | `src/net/RemotePlayers.ts` | Desenha os outros (corpo, chapéu, nome) com interpolação de 120 ms. |
| Mobs compartilhados | `src/net/MobSync.ts` | Dono por shard: simula ou segue (fantoche) cada rato, rato-bomba e jacaré. |

- **Interesse por shard**: o servidor usa os mesmos shards do jogo (`docs/shards.md`). Cada cliente
  recebe quem está a até 3 shards; no esgoto, só quem também está no esgoto. Quem sai do raio some.
- **Esgoto compartilhado**: ao descer, o cliente pede a semente ao servidor. Se alguém já está lá
  embaixo, recebe a mesma (todos na mesma masmorra); se não, uma nova. Offline, a semente é local.
- **Mundo**: a superfície já é igual em todo cliente, porque é gerada pela semente fixa dos shards.

## Mobs compartilhados (dono por shard)

- **Dono**: a cada tick o servidor dá cada shard ativo a um jogador que o tem no raio de simulação
  (2 shards). O dono atual fica enquanto puder; se sair, assume quem conectou primeiro.
- **Dono simula, os outros desenham**: o dono roda a IA dos ratos, ratos-bomba e jacarés do shard e
  manda o estado a 15 Hz; nos outros clientes esses mobs são fantoches (`Actor.puppet`) que só
  deslizam até a posição recebida e mostram a pose.
- **Alvo**: a IA mira o jogador vivo mais perto, local ou remoto (`Game.nearestTarget`). Dano num
  jogador remoto vai por mensagem `hurt`; cuspe e explosão acertam qualquer jogador.
- **Golpe**: acertar um fantoche manda `hit` ao servidor, que entrega a quem simula o mob.
- **Fronteira**: mob que entra no shard de outro dono é entregue; quem perde um shard transforma os
  mobs de lá em fantoches, e quem ganha assume os fantoches que já tinha. Se o dono desconecta, os
  mobs dele ficam no servidor até o novo dono assumir.
- **Nascimento**: mob novo (início, respawn) só nasce em shard próprio; mobs locais que nunca foram
  anunciados num shard de outro dono são descartados. No esgoto, quem desce depois entra na masmorra
  de quem já está lá e recebe os mobs dele.
- **Explosões**: o dono aplica o dano e manda um `fx`, que nos outros vira só o efeito visual.

## Limites desta versão

- O chefe (Mr. Kabumstic), os lacaios dele e os itens continuam locais: cada jogador luta com o
  próprio chefe e pega as próprias poções. Drop de poção de rato só aparece para o dono do rato.
- O servidor confia na posição que o cliente manda (só valida o formato). Não há anti-cheat.
- Sem reconexão automática: se o servidor cair, o jogo volta a ser offline até recarregar.

O próximo passo natural é dar a cada shard um dono autoritativo, que simula os inimigos dele e
replica o estado para quem tem interesse (os eventos `onEnter`/`onLeave` do `ShardManager` são o gancho).
