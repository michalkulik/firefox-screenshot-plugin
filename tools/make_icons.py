#!/usr/bin/env python3
"""Generuje ikony wtyczki (PNG) w katalogu icons/.

Uruchomienie:  python3 tools/make_icons.py
Wymaga: Pillow.
"""
import os
from PIL import Image, ImageDraw

S = 512
ACCENT = (67, 56, 202)
GRAD_TOP = (129, 131, 245)
GRAD_BOTTOM = (67, 56, 202)
WHITE = (255, 255, 255, 255)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")


def make_master() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Tło z pionowym gradientem w zaokrąglonym kwadracie.
    grad = Image.new("RGB", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        t = y / (S - 1)
        gd.line(
            [(0, y), (S, y)],
            fill=tuple(int(GRAD_TOP[i] + (GRAD_BOTTOM[i] - GRAD_TOP[i]) * t) for i in range(3)),
        )
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=112, fill=255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)

    # Górny występ (wizjer).
    d.rounded_rectangle([196, 116, 316, 184], radius=20, fill=WHITE)
    # Korpus aparatu.
    d.rounded_rectangle([92, 164, 420, 404], radius=44, fill=WHITE)
    # Obiektyw.
    d.ellipse([184, 200, 328, 344], fill=ACCENT + (255,))
    d.ellipse([206, 222, 306, 322], fill=WHITE)
    d.ellipse([234, 250, 278, 294], fill=ACCENT + (255,))
    # Lampa błyskowa.
    d.ellipse([340, 192, 372, 224], fill=ACCENT + (255,))

    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    master = make_master()
    master.save(os.path.join(OUT, "icon-512.png"))
    for size in (16, 32, 48, 96, 128):
        master.resize((size, size), Image.LANCZOS).save(
            os.path.join(OUT, f"icon-{size}.png")
        )
    print("Ikony zapisane w", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
