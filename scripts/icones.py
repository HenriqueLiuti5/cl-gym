# /// script
# requires-python = ">=3.12"
# dependencies = ["pillow"]
# ///
"""Gera os ícones do app a partir da logo oficial (`frontend/marca/logo.png`):

    uv run scripts/icones.py

Saem em `frontend/public/`:

- `icone-192.png` e `icone-512.png`: ícone comum (manifest, favicon e tela de login);
- `icone-maskable-512.png`: o Android corta em círculo, gota ou quadrado, então o desenho fica
  dentro da área segura (círculo de 80% do lado);
- `apple-touch-icon.png` (180 px): ícone da tela de início no iPhone.

O emblema é centralizado pelo que aparece (o fundo é preto) e não pela imagem original, que tem
mais sobra embaixo do que em cima. Pode rodar de novo quando a logo mudar.
"""

import math
from pathlib import Path

from PIL import Image, ImageChops

RAIZ = Path(__file__).resolve().parent.parent
LOGO = RAIZ / "frontend" / "marca" / "logo.png"
SAIDA = RAIZ / "frontend" / "public"

# Abaixo disso o pixel conta como fundo (o brilho em volta do emblema some no ícone pequeno).
LIMIAR_FUNDO = 12
# Ícone comum: o emblema ocupa 86% do lado. Maskable: cabe no círculo da área segura (80% do lado).
OCUPACAO_COMUM = 0.86
DIAMETRO_MASKABLE = 0.80


def recortar_emblema(logo: Image.Image) -> Image.Image:
    """Recorta o retângulo onde há desenho (tudo que passa do limiar do fundo)."""
    mascara = logo.point(lambda v: 255 if v > LIMIAR_FUNDO else 0)
    caixa = mascara.getbbox()
    if caixa is None:
        raise SystemExit(f"{LOGO} parece vazia (só fundo preto).")
    return logo.crop(caixa)


def raio_do_desenho(emblema: Image.Image) -> float:
    """Maior distância entre o centro do recorte e um pixel desenhado (para a área segura)."""
    pequeno = emblema.copy()
    pequeno.thumbnail((400, 400))
    escala = emblema.width / pequeno.width
    cx, cy = pequeno.width / 2, pequeno.height / 2
    dados = pequeno.load()
    raio = 0.0
    for y in range(pequeno.height):
        for x in range(pequeno.width):
            if dados[x, y] > LIMIAR_FUNDO:
                raio = max(raio, math.hypot(x + 0.5 - cx, y + 0.5 - cy))
    return raio * escala


def montar(emblema: Image.Image, lado: int, escala: float) -> Image.Image:
    """Põe o emblema, redimensionado por `escala`, no centro de um quadrado preto de `lado` px."""
    largura = max(1, round(emblema.width * escala))
    altura = max(1, round(emblema.height * escala))
    reduzido = emblema.resize((largura, altura), Image.Resampling.LANCZOS)
    fundo = Image.new("L", (lado, lado), 0)
    fundo.paste(reduzido, ((lado - largura) // 2, (lado - altura) // 2))
    return fundo.convert("RGB")


def main() -> None:
    logo = Image.open(LOGO).convert("L")
    # O fundo tem de ser preto puro, senão o recorte deixa uma emenda visível no ícone.
    if ImageChops.difference(logo.crop((0, 0, 8, 8)), Image.new("L", (8, 8), 0)).getbbox():
        print("Aviso: o canto da logo não é preto puro; o ícone pode mostrar uma emenda.")
    emblema = recortar_emblema(logo)
    maior_lado = max(emblema.size)
    raio = raio_do_desenho(emblema)

    def comum(lado: int) -> Image.Image:
        return montar(emblema, lado, lado * OCUPACAO_COMUM / maior_lado)

    icones = {
        "icone-192.png": comum(192),
        "icone-512.png": comum(512),
        "apple-touch-icon.png": comum(180),
        "icone-maskable-512.png": montar(emblema, 512, 512 * DIAMETRO_MASKABLE / 2 / raio),
    }
    for nome, imagem in icones.items():
        destino = SAIDA / nome
        imagem.save(destino, optimize=True)
        kb = destino.stat().st_size // 1024
        print(f"{destino.relative_to(RAIZ)}  {imagem.width}x{imagem.height}  {kb} KB")


if __name__ == "__main__":
    main()
