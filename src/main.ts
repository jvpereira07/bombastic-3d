import './style.css';
import { Assets } from './engine/Assets';
import { AudioEngine } from './engine/AudioEngine';
import { Engine } from './engine/Engine';
import { Input } from './engine/Input';
import { IMAGE_URLS } from './assets';
import { Game } from './game/Game';
import { Hud } from './game/ui/Hud';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('Canvas #game ausente');
  const assets = new Assets(IMAGE_URLS);
  await assets.loadAll();
  const mode = new URLSearchParams(location.search).has('test') ? 'test' : 'normal';
  const engine = new Engine(canvas);
  const game = new Game(engine, assets, new Input(canvas), new AudioEngine(), new Hud(assets), mode);
  engine.add(game);
  const params = new URLSearchParams(location.search);
  if (params.has('online') || params.has('server')) {
    game.goOnline(params.get('name') ?? `Jogador-${Math.floor(Math.random() * 1000)}`);
  }
  engine.start();
  Object.assign(window, { game }); // atalho para depurar no console
}

boot().catch((err: unknown) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<p class="boot-error">Não foi possível iniciar o jogo: ${String(err)}</p>`);
});
