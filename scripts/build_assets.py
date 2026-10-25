"""Gera src/assets/*.png a partir do repositório bombastic-pygame.

Uso: python3 scripts/build_assets.py ../bombastic-pygame
Requer Pillow. Reorganiza as folhas para a ordem de linhas usada no jogo 3D:
0 costas, 1 esquerda, 2 frente, 3 direita (o projeto original usa direita, esquerda, baixo, cima).
"""
import sys
from pathlib import Path

from PIL import Image

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else '../bombastic-pygame') / 'assets' / 'images'
OUT = Path(__file__).resolve().parent.parent / 'src' / 'assets'
T = 32
ORDER = [3, 1, 2, 0]


def img(path: str) -> Image.Image:
    return Image.open(SRC / path).convert('RGBA')


def cell(im: Image.Image, row: int, col: int) -> Image.Image:
    return im.crop((col * T, row * T, col * T + T, row * T + T))


def character_sheets(sheet: Image.Image) -> tuple[Image.Image, Image.Image, Image.Image]:
    """Parado + 6 de caminhada (linhas 0-7); combo de 3 golpes (16+d, 20+d, 24+d); dash (12+d)."""
    move, atk, dash = Image.new('RGBA', (7 * T, 4 * T)), Image.new('RGBA', (18 * T, 4 * T)), Image.new('RGBA', (8 * T, 4 * T))
    for i, d in enumerate(ORDER):
        move.paste(cell(sheet, d, 0), (0, i * T))
        for c in range(6):
            move.paste(cell(sheet, 4 + d, c), (T * (c + 1), i * T))
        for k in range(3):
            for c in range(6):
                atk.paste(cell(sheet, 16 + 4 * k + d, c), (T * (k * 6 + c), i * T))
        for c in range(8):
            dash.paste(cell(sheet, 12 + d, c), (c * T, i * T))
    return move, atk, dash


def reorder_rows(sheet: Image.Image, first_row: int, cols: int) -> Image.Image:
    out = Image.new('RGBA', (cols * T, 4 * T))
    for i, d in enumerate(ORDER):
        for c in range(cols):
            out.paste(cell(sheet, first_row + d, c), (c * T, i * T))
    return out


def save(im: Image.Image, name: str) -> None:
    im.save(OUT / f'{name}.png', optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    move, atk, dash = character_sheets(img('player/Player_Sheet.png'))
    swords = img('Armas/Movimento_espadas.png')  # espada desenhada por cima do ataque
    for i, d in enumerate(ORDER):
        for k in range(3):
            for c in range(6):
                x, y = T * (k * 6 + c), i * T
                frame = atk.crop((x, y, x + T, y + T))
                frame.alpha_composite(cell(swords, 4 * k + d, c))
                atk.paste(frame, (x, y))
    save(move, 'player_move')
    save(atk, 'player_atk')
    save(dash, 'player_dash')

    for sheet, name in zip(character_sheets(img('player/armaduras/Cabeça/Sombrero_Mexicano.png')), ['hat_move', 'hat_atk', 'hat_dash']):
        save(sheet, name)

    rat = img('mobs/rat-sheet.png')
    save(reorder_rows(rat, 0, 5), 'rat_walk')
    save(reorder_rows(rat, 4, 6), 'rat_atk')
    save(reorder_rows(img('mobs/rato_bomb _Sheet.png'), 0, 5), 'bomb')
    save(reorder_rows(img('projectiles/Espada_slash-Sheet.png'), 0, 5), 'slash')

    tiles = img('layers/basic.png')
    for name, (x, y) in {'water': (32, 320), 'brick': (160, 288), 'grate': (96, 320), 'floor': (160, 64)}.items():
        save(tiles.crop((x, y, x + T, y + T)), name)

    copies = {
        'boss': 'Boss/Mr_Kabumstic/Bombastic_Animation-Sheet.png', 'plane': 'Boss/Mr_Kabumstic/Rato_Avião-Sheet.png',
        'para': 'mobs/Rato_paraquedas-Sheet.png', 'boom': 'efeitos/Rato_efeitos/explosion-Sheet.png',
        'note': 'Boss/projetil/Nota_2-Sheet.png', 'potion': 'Itens/Poção_Vermelha.png', 'sombrero': 'Itens/sombrero.png',
        'barril': 'Elementos de cenario/barril.png', 'vaso': 'layers/vaso.png',
        'ui_hp_full': 'GUI/inventory/BARRA_VIDA_CHEIA.png', 'ui_hp_empty': 'GUI/inventory/BARRA_VIDA_VAZIA.png',
        'ui_st_full': 'GUI/inventory/BARRA_ENERGIA_CHEIA.png', 'ui_st_empty': 'GUI/inventory/BARRA_ENERGIA_VAZIA.png',
        'ui_slot': 'GUI/inventory/SLOT_HUD_2.png',
        'gator': 'mobs/Jacaré/sheet_Jacare.png', 'spit': 'mobs/Jacaré/cuspeD.png',
    }
    for name, path in copies.items():
        save(img(path), name)
    print(f'{len(list(OUT.glob("*.png")))} imagens em {OUT}')


if __name__ == '__main__':
    main()
