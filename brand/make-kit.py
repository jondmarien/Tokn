#!/usr/bin/env python3
"""
Generate the tokn image kit.

    python3 brand/make-kit.py

Reproducible on purpose: the assets are derived from the same geometry and
palette as the website's mark, so a change to the brand is one edit here rather
than a hunt through exported PNGs nobody can regenerate. The pseudo-random
heatmap is seeded, so re-running produces byte-identical output.

Sizes and safe areas follow what X actually does to these images, which is the
part most kits get wrong:

  avatar   400x400, displayed as a circle. Anything outside the inscribed
           circle is cut, so the mark is sized against the circle, not the
           square, with room to spare for the ring some clients draw.

  header   1500x500. The avatar is overlaid on the lower left and the image is
           re-cropped on narrow screens, so the lower-left corner is treated as
           unusable and everything that must be read sits in a band down the
           vertical middle.

  card     1200x630, the link preview. Twitter crops the card toward the centre
           at some breakpoints, so the content is centred rather than ranged
           left.
"""

import pathlib
import random

from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).parent
FONTS = HERE / ".fonts"
OUT = HERE / "twitter"
GH = HERE / "github"
for _d in (OUT, GH):
    _d.mkdir(parents=True, exist_ok=True)

BG = (18, 18, 20, 255)        # --bg
SUB_ALT = (27, 27, 30, 255)   # --sub-alt
SUB = (115, 115, 123, 255)    # --sub
TEXT = (217, 217, 214, 255)   # --text
MAIN = (204, 255, 51, 255)    # --main

DOMAIN = "toknhq.com"

REGULAR = str(FONTS / "GeistMono-Regular.ttf")
MEDIUM = str(FONTS / "GeistMono-Medium.ttf")


def font(path, size):
    return ImageFont.truetype(path, size)


# --------------------------------------------------------------------- mark


def mark(draw, cx, cy, size, color=MAIN, bg=BG):
    """
    The bracketed token, centred on (cx, cy) and `size` across.

    Same construction as `web/public/icon-512.png`: one rounded rectangle with
    the middle of its top and bottom edges erased, which is what a pair of
    brackets is. Deriving it this way keeps the corner radii identical to the
    SVG instead of re-guessing the arcs.
    """
    half = size / 2
    box = [cx - half, cy - half, cx + half, cy + half]
    stroke = max(2, round(size * 0.18))
    radius = round(size * 0.27)
    gap = size * 0.25

    draw.rounded_rectangle(box, radius=radius, outline=color, width=stroke)
    draw.rectangle([cx - gap, box[1] - stroke, cx + gap, box[1] + stroke], fill=bg)
    draw.rectangle([cx - gap, box[3] - stroke, cx + gap, box[3] + stroke], fill=bg)

    r = stroke / 2
    for x in (cx - gap, cx + gap):
        for y in (box[1] + r, box[3] - r):
            draw.ellipse([x - r, y - r, x + r, y + r], fill=color)

    dot = size * 0.135
    draw.rounded_rectangle(
        [cx - dot, cy - dot, cx + dot, cy + dot], radius=round(dot * 0.58), fill=color
    )


# ------------------------------------------------------------------ texture


def heatmap(width, height, cell=13, gap=4, seed=7, rows=7):
    """
    The contribution graph, as a texture.

    It is the site's most recognisable object, so it does the work of saying
    what this account is before anyone reads a word. Levels are weighted toward
    empty so it reads as a real year rather than a full grid.
    """
    rng = random.Random(seed)
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pitch = cell + gap
    cols = width // pitch + 1
    top = (height - (rows * pitch - gap)) // 2

    levels = [0, 0, 0, 0, 1, 1, 2, 2, 3, 4]
    alpha = {0: 16, 1: 52, 2: 104, 3: 168, 4: 236}

    for c in range(cols):
        # A gentle left-to-right ramp, so the texture builds instead of
        # sitting flat — a real profile's activity is not uniform.
        bias = c / max(cols - 1, 1)
        for r in range(rows):
            lvl = rng.choice(levels)
            if bias > 0.55 and rng.random() < bias * 0.45:
                lvl = min(4, lvl + 1)
            x, y = c * pitch, top + r * pitch
            d.rounded_rectangle(
                [x, y, x + cell, y + cell],
                radius=3,
                fill=MAIN[:3] + (alpha[lvl],),
            )
    return layer


def fade(layer, start, end, invert=False):
    """Fade a layer horizontally between two x positions."""
    w, h = layer.size
    mask = Image.new("L", (w, 1))
    px = mask.load()
    for x in range(w):
        if x <= start:
            v = 0
        elif x >= end:
            v = 255
        else:
            v = round(255 * (x - start) / (end - start))
        px[x, 0] = 255 - v if invert else v
    mask = mask.resize((w, h))
    out = layer.copy()
    out.putalpha(Image.composite(layer.getchannel("A"), Image.new("L", (w, h), 0), mask))
    return out


# ------------------------------------------------------------------- assets


def avatar(path, inverted=False):
    S = 400
    bg, fg = (MAIN, BG) if inverted else (BG, MAIN)
    img = Image.new("RGBA", (S, S), bg)
    d = ImageDraw.Draw(img)
    # Sized against the inscribed circle, not the square: X crops to a circle,
    # and several clients draw a ring just inside it.
    mark(d, S / 2, S / 2, 196, color=fg, bg=bg)
    img.save(path)
    return path


def org_avatar(path):
    """
    GitHub's org avatar: 500x500, shown as a rounded square rather than a
    circle, so it can use more of the frame than the X avatar does.
    """
    S = 500
    img = Image.new("RGBA", (S, S), BG)
    d = ImageDraw.Draw(img)
    mark(d, S / 2, S / 2, 268)
    img.save(path)
    return path


def header(path):
    W, H = 1500, 500
    img = Image.new("RGBA", (W, H), BG)

    d = ImageDraw.Draw(img)
    x = 96

    # Lockup and tagline first, so their extents decide where the texture may
    # begin. The first pass faded the heatmap in at a number picked by eye and
    # it ran straight through the tagline.
    lock_y = 208
    mark(d, x + 34, lock_y, 68)
    d.text((x + 96, lock_y + 2), "tokn", font=font(MEDIUM, 78), fill=TEXT, anchor="lm")

    tag = "track what AI coding actually costs you"
    tag_font = font(REGULAR, 31)
    d.text((x, 300), tag, font=tag_font, fill=SUB, anchor="lt")
    tag_right = x + d.textlength(tag, font=tag_font)

    tex = heatmap(W, H, cell=15, gap=5, rows=7)
    # Start the fade a clear margin past the longest line of type, so the
    # texture never competes with something that has to be read.
    img.alpha_composite(fade(tex, tag_right + 90, W - 120))

    # Bottom-right: the one corner X neither covers with the avatar nor crops
    # away first.
    d.text((W - 96, H - 62), DOMAIN, font=font(MEDIUM, 30), fill=MAIN, anchor="rs")

    img.convert("RGB").save(path, quality=96)
    return path


def card(path):
    """The link preview, 1200x630."""
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), BG)
    d = ImageDraw.Draw(img)

    # A horizontal lockup. Stacking the mark above the wordmark crowded both
    # and left the mark reading as a bullet rather than a logo.
    x = 100
    mark(d, x + 40, 168, 80)
    d.text((x + 112, 172), "tokn", font=font(MEDIUM, 96), fill=TEXT, anchor="lm")

    d.text((x, 300), "track what AI coding", font=font(REGULAR, 54), fill=TEXT, anchor="lt")
    d.text((x, 366), "actually costs you", font=font(REGULAR, 54), fill=TEXT, anchor="lt")
    d.text((x, 452), "Scanned locally by the CLI. Ranked here.",
           font=font(REGULAR, 30), fill=SUB, anchor="lt")
    dom_font = font(MEDIUM, 34)
    d.text((x, 522), DOMAIN, font=dom_font, fill=MAIN, anchor="lt")
    dom_right = x + d.textlength(DOMAIN, font=dom_font)

    # The texture sits under the type as a footer band rather than floating —
    # and, like the header, only begins once the type it shares a line with has
    # ended. Measuring beats guessing: the first attempt put the domain
    # straight on top of the heatmap.
    tex = heatmap(W, 190, cell=13, gap=5, rows=4, seed=19)
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    band.alpha_composite(tex, (0, H - 172))
    img.alpha_composite(fade(band, dom_right + 70, W - 130))

    img.convert("RGB").save(path, quality=96)
    return path


def contact_sheet(path, made):
    """Everything at once, including the avatar as it will actually be cropped."""
    W, H = 1600, 1180
    img = Image.new("RGBA", (W, H), (10, 10, 12, 255))
    d = ImageDraw.Draw(img)
    small = font(REGULAR, 20)

    head = Image.open(OUT / "header-1500x500.png").resize((1400, 467))
    img.paste(head, (100, 60))
    d.text((100, 40), "header · 1500×500", font=small, fill=SUB, anchor="ls")

    # The avatar, masked to a circle, where X overlays it on the header.
    av = Image.open(OUT / "avatar-400.png").resize((186, 186)).convert("RGBA")
    circle = Image.new("L", (186, 186), 0)
    ImageDraw.Draw(circle).ellipse([0, 0, 185, 185], fill=255)
    ring = Image.new("RGBA", (198, 198), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse([0, 0, 197, 197], fill=(10, 10, 12, 255))
    ring.paste(av, (6, 6), circle)
    img.alpha_composite(ring, (150, 400))

    y = 640
    d.text((100, y - 22), "avatar · 400×400, as X crops it", font=small, fill=SUB, anchor="ls")
    for i, name in enumerate(["avatar-400.png", "avatar-lime.png"]):
        a = Image.open(OUT / name).resize((150, 150)).convert("RGBA")
        m = Image.new("L", (150, 150), 0)
        ImageDraw.Draw(m).ellipse([0, 0, 149, 149], fill=255)
        img.paste(a, (100 + i * 180, y), m)
        for j, s in enumerate((48, 24)):
            t = Image.open(OUT / name).resize((s, s)).convert("RGBA")
            mm = Image.new("L", (s, s), 0)
            ImageDraw.Draw(mm).ellipse([0, 0, s - 1, s - 1], fill=255)
            img.paste(t, (100 + i * 180 + j * 62, y + 168), mm)

    cd = Image.open(OUT / "card-1200x630.png").resize((660, 346))
    img.paste(cd, (560, y))
    d.text((560, y - 22), "link card · 1200×630", font=small, fill=SUB, anchor="ls")

    img.convert("RGB").save(path, quality=95)
    return path


if __name__ == "__main__":
    made = [
        org_avatar(GH / "org-avatar-500.png"),
        avatar(OUT / "avatar-400.png"),
        avatar(OUT / "avatar-lime.png", inverted=True),
        header(OUT / "header-1500x500.png"),
        card(OUT / "card-1200x630.png"),
    ]
    made.append(contact_sheet(OUT / "_contact-sheet.png", made))
    for p in made:
        size = p.stat().st_size
        with Image.open(p) as im:
            print(f"  {p.name:<26} {im.size[0]:>5}x{im.size[1]:<5} {size/1024:>7.1f} KB")
