"""Genera los iconos y la pantalla de carga de Stocky a partir del logo.

    python3 assets/brand/build-icons.py        (requiere Pillow: pip install pillow)

Entrada: assets/brand/logo.png — el logo circular (círculo verde con el texto
«Stocky» y el tejado) sobre fondo blanco.

Salida (en assets/):
  - android-icon-foreground.png  Solo el tejado y el texto, sobre transparente,
                                 dentro de la zona segura (66 %) del icono adaptativo.
  - android-icon-background.png  Degradado verde a sangre.
    → Android recorta el icono con la forma de cada móvil (círculo, cuadrado
      redondeado…); al separar texto y fondo se ve bien con cualquier forma.
  - android-icon-monochrome.png  Silueta para los iconos temáticos de Android 13+.
  - icon.png                     El logo redondo con las esquinas transparentes.
  - splash-icon.png              El logo dentro del círculo que deja ver Android 12+.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent
SIZE = 1024


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def load_logo() -> Image.Image:
    """Logo con el fondo blanco exterior convertido en transparencia."""
    src = Image.open(HERE / "logo.png").convert("RGB")
    # Fondo = zona casi blanca conectada con los bordes (el texto blanco está dentro del círculo y no se toca).
    px_src = src.load()
    w, h = src.size
    mask = Image.new("L", (w, h), 0)
    mpx = mask.load()
    for y in range(h):
        for x in range(w):
            if min(px_src[x, y]) > 225:
                mpx[x, y] = 255
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(mask, corner, 128)
    alpha = mask.point(lambda v: 0 if v == 128 else 255)
    # Se recorta un poco el borde (quita el halo blanco) y se suaviza.
    alpha = alpha.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(1.2))
    logo = src.convert("RGBA")
    logo.putalpha(alpha)
    return logo.crop(alpha.getbbox())


def mark_only(logo: Image.Image) -> Image.Image:
    """Tejado y texto (lo claro) sobre transparente; el verde del círculo desaparece."""
    rgb = logo.convert("RGB")
    out = logo.copy()
    # Se mira el canal mínimo (el menor de R, G y B): círculo ≤ ~80, tejado ≥ ~115, texto 255.
    lo, hi = 85, 112
    px = rgb.load()
    w, h = rgb.size
    al = Image.new("L", (w, h), 0)
    apx = al.load()
    lpx = logo.split()[3].load()
    for y in range(h):
        for x in range(w):
            m = min(px[x, y])
            v = 0 if m <= lo else 255 if m >= hi else int((m - lo) * 255 / (hi - lo))
            apx[x, y] = min(v, lpx[x, y])
    out.putalpha(al)
    return out.crop(al.getbbox())


def gradient(size: int) -> Image.Image:
    """Degradado diagonal como el del círculo del logo (claro arriba a la derecha)."""
    stops = [(0.0, (99, 190, 92)), (0.55, (31, 142, 69)), (1.0, (10, 106, 58))]
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = ((size - 1 - x) + y) / (2 * (size - 1))
            for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
                if t <= t1:
                    k = (t - t0) / (t1 - t0)
                    px[x, y] = tuple(int(lerp(c0[i], c1[i], k)) for i in range(3))
                    break
    return img


def place(img: Image.Image, max_w: float, max_h: float, canvas: Image.Image) -> Image.Image:
    scale = min(max_w / img.width, max_h / img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(resized, ((canvas.width - resized.width) // 2, (canvas.height - resized.height) // 2))
    return canvas


def main() -> None:
    logo = load_logo()
    mark = mark_only(logo)

    # Icono adaptativo: lo importante debe caber en el 66 % central (zona segura).
    fg = place(mark, SIZE * 0.62, SIZE * 0.56, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)))
    fg.save(ASSETS / "android-icon-foreground.png", optimize=True)
    gradient(SIZE).save(ASSETS / "android-icon-background.png", optimize=True)

    mono = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
    mono.putalpha(fg.split()[3])
    mono.save(ASSETS / "android-icon-monochrome.png", optimize=True)

    # Icono «normal» (Android 7 y tiendas): el logo redondo completo.
    place(logo, SIZE * 0.96, SIZE * 0.96, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))).save(ASSETS / "icon.png", optimize=True)

    # Pantalla de carga: Android 12+ muestra solo un círculo de 2/3 del lienzo.
    # Un poco mayor que ese círculo para que no quede un aro del color de fondo.
    place(logo, SIZE * 0.69, SIZE * 0.69, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))).save(ASSETS / "splash-icon.png", optimize=True)
    print("Iconos generados en", ASSETS)


if __name__ == "__main__":
    main()
