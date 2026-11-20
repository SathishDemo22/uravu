"""Draws the Uravu app icons into ../icons. Run: python tools/make_icons.py

The mark is a small family tree: one person at the top joined to two below,
white on Uravu blue, with the lower-right person in the app's Tamil amber.
"""
from pathlib import Path
from PIL import Image, ImageDraw

BLUE = (31, 91, 209, 255)
WHITE = (255, 255, 255, 255)
AMBER = (240, 180, 76, 255)
OUT = Path(__file__).resolve().parent.parent / "icons"
SS = 4  # supersampling for smooth edges


def mark(d, cx, cy, s):
    """Tree mark centred on (cx, cy); s = overall height in px."""
    w = s * 0.11                      # line width
    top = (cx, cy - s * 0.30)
    bl, br = (cx - s * 0.30, cy + s * 0.30), (cx + s * 0.30, cy + s * 0.30)
    bus = cy + s * 0.02               # the joining bar
    r_top, r_low = s * 0.155, s * 0.135

    def line(a, b):
        d.line([a, b], fill=WHITE, width=round(w))
        for p in (a, b):              # round caps
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=WHITE)

    line(top, (cx, bus))
    line((bl[0], bus), (br[0], bus))
    line((bl[0], bus), bl)
    line((br[0], bus), br)

    def dot(p, r, col):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=col)

    dot(top, r_top, WHITE)
    dot(bl, r_low, WHITE)
    dot(br, r_low, AMBER)


def icon(size, maskable=False, rounded=True):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable or not rounded:
        d.rectangle([0, 0, S, S], fill=BLUE)
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=BLUE)
    # maskable icons must keep the mark inside the central safe circle (80%)
    mark(d, S / 2, S / 2, S * (0.50 if maskable else 0.62))
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    icon(192).save(OUT / "icon-192.png")
    icon(512).save(OUT / "icon-512.png")
    icon(512, maskable=True).save(OUT / "icon-maskable-512.png")
    icon(180, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")
    icon(32).save(OUT / "favicon-32.png")
    print("Icons written to", OUT)


if __name__ == "__main__":
    main()
