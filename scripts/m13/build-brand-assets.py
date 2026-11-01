#!/usr/bin/env python3
"""Generate the Fabric of Nations brand raster assets.

The existing visual identity is retained: deep-ink background, brass accent,
parchment text and the serif display face used by the app. The old favicon was a
plain "C"; this replaces it with a typographic "F" monogram and adds the icon,
adaptive-icon, PWA and touch icons that the Expo application metadata expects.

Run from the repository root:

    python scripts/m13/build-brand-assets.py

Pillow is only needed when regenerating these committed assets; the game build
never runs this script.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "packages" / "app" / "assets"
PUBLIC_ICONS = ROOT / "packages" / "app" / "public" / "icons"
DOC_IMAGES = ROOT / "docs" / "images"

INK = "#0b1014"
INK_ALT = "#0e151a"
BRASS = "#e2bd4a"
BRASS_DIM = "#c9a227"
BORDER = "#35464f"
PARCHMENT = "#f7f1e1"
MUTED = "#9caaa7"

FONT_CANDIDATES = (
    "C:/Windows/Fonts/georgiab.ttf",
    "C:/Windows/Fonts/timesbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/Library/Fonts/Georgia Bold.ttf",
)


def display_font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    raise SystemExit(
        "No serif display font found. Add a path to FONT_CANDIDATES in "
        "scripts/m13/build-brand-assets.py."
    )


def tracked_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, tracking: int) -> int:
    return int(sum(draw.textlength(character, font=font) for character in text) + tracking * (len(text) - 1))


def draw_tracked(
    draw: ImageDraw.ImageDraw,
    center_x: int,
    baseline_top: int,
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: str,
    tracking: int,
) -> None:
    width = tracked_size(draw, text, font, tracking)
    x = center_x - width / 2
    for character in text:
        draw.text((x, baseline_top), character, font=font, fill=fill)
        x += draw.textlength(character, font=font) + tracking


def build_mark(size: int, *, maskable: bool = False) -> Image.Image:
    """Square mark: inset brass frame and a serif F monogram."""
    image = Image.new("RGB", (size, size), INK)
    draw = ImageDraw.Draw(image)
    scale = size / 1024
    frame = int((96 if maskable else 62) * scale)
    inset = int(56 * scale)
    line = max(1, int(3 * scale))
    draw.rounded_rectangle(
        (inset, inset, size - inset, size - inset),
        radius=int(20 * scale),
        outline=BORDER,
        width=line,
    )
    draw.rounded_rectangle(
        (frame, frame, size - frame, size - frame),
        radius=int(14 * scale),
        outline=BRASS_DIM,
        width=max(1, int(2 * scale)),
    )
    font = display_font(int((470 if maskable else 540) * scale))
    box = draw.textbbox((0, 0), "F", font=font)
    text_width = box[2] - box[0]
    text_height = box[3] - box[1]
    x = (size - text_width) / 2 - box[0]
    y = (size - text_height) / 2 - box[1] - int(8 * scale)
    draw.text((x, y), "F", font=font, fill=BRASS)
    # A short parchment rule anchors the monogram without adding a second glyph.
    rule_y = int(size * 0.735)
    rule_half = int(size * 0.13)
    draw.line((size / 2 - rule_half, rule_y, size / 2 + rule_half, rule_y), fill=PARCHMENT, width=max(1, int(4 * scale)))
    return image


def build_adaptive_foreground(size: int = 1024) -> Image.Image:
    """Transparent Android adaptive foreground with content inside the safe zone."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    ring = int(size * 0.292)
    draw.ellipse(
        (size / 2 - ring, size / 2 - ring, size / 2 + ring, size / 2 + ring),
        outline=BRASS_DIM,
        width=max(1, int(3 * (size / 1024))),
    )
    font = display_font(int(400 * (size / 1024)))
    box = draw.textbbox((0, 0), "F", font=font)
    x = (size - (box[2] - box[0])) / 2 - box[0]
    y = (size - (box[3] - box[1])) / 2 - box[1] - int(6 * (size / 1024))
    draw.text((x, y), "F", font=font, fill=BRASS)
    return image


def build_wordmark(width: int = 1600, height: int = 900) -> Image.Image:
    image = Image.new("RGB", (width, height), INK)
    draw = ImageDraw.Draw(image)
    draw.rectangle((40, 40, width - 40, height - 40), outline=BORDER, width=2)
    draw.rectangle((60, 60, width - 60, height - 60), outline=BRASS_DIM, width=1)
    kicker = display_font(30)
    draw_tracked(draw, width // 2, 218, "GRAND STRATEGY  ·  1900–2000", kicker, MUTED, 9)
    title = display_font(112)
    draw_tracked(draw, width // 2, 335, "FABRIC OF NATIONS", title, PARCHMENT, 10)
    draw.line((width // 2 - 130, 515, width // 2 + 130, 515), fill=BRASS, width=4)
    subtitle = display_font(28)
    draw_tracked(draw, width // 2, 565, "A HISTORICAL WORLD SIMULATION", subtitle, BRASS, 7)
    return image


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    PUBLIC_ICONS.mkdir(parents=True, exist_ok=True)
    DOC_IMAGES.mkdir(parents=True, exist_ok=True)

    icon = build_mark(1024)
    icon.save(ASSETS / "icon.png", optimize=True)
    icon.save(ASSETS / "favicon.png", optimize=True)
    build_adaptive_foreground(1024).save(ASSETS / "adaptive-icon.png", optimize=True)

    icon.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC_ICONS / "icon-192.png", optimize=True)
    icon.resize((512, 512), Image.Resampling.LANCZOS).save(PUBLIC_ICONS / "icon-512.png", optimize=True)
    build_mark(512, maskable=True).save(PUBLIC_ICONS / "maskable-512.png", optimize=True)
    icon.resize((180, 180), Image.Resampling.LANCZOS).save(PUBLIC_ICONS / "apple-touch-icon.png", optimize=True)

    build_wordmark().save(DOC_IMAGES / "m13-brand-wordmark.png", optimize=True)
    print("wrote Fabric of Nations icon, favicon, adaptive icon, PWA icons and wordmark")


if __name__ == "__main__":
    main()
