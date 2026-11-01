"""Render a static M12a province preview from the committed bundle.

This is a development/verification renderer, not part of the game. It draws the
1900 province fills, thin (dashed) internal province edges and stronger
international borders so the authored partition can be inspected without a
browser.
"""

from __future__ import annotations

import colorsys
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = json.loads(
    (ROOT / "packages/data/data/map/provinces_1900.json").read_text(encoding="utf-8")
)
OUT = ROOT / "docs/images/m12a-provinces-1900.png"

# Europe focus.
MIN_LON, MAX_LON = -12.0, 46.0
MIN_LAT, MAX_LAT = 34.0, 72.0
WIDTH, HEIGHT = 1700, 1500


def project(lon: float, lat: float) -> tuple[float, float]:
    x = (lon - MIN_LON) / (MAX_LON - MIN_LON) * WIDTH
    y = (MAX_LAT - lat) / (MAX_LAT - MIN_LAT) * HEIGHT
    return x, y


def decode(flat: list[int]) -> list[tuple[float, float]]:
    points = []
    x = 0
    y = 0
    for index in range(0, len(flat), 2):
        x += flat[index]
        y += flat[index + 1]
        points.append((x / 1000.0, y / 1000.0))
    return points


def color_for(tag: str) -> tuple[int, int, int]:
    digest = hashlib.sha1(tag.encode("utf-8")).hexdigest()
    hue = int(digest[:6], 16) / 0xFFFFFF
    saturation = 0.45 + (int(digest[6:8], 16) / 255) * 0.2
    value = 0.62 + (int(digest[8:10], 16) / 255) * 0.24
    return tuple(int(channel * 255) for channel in colorsys.hsv_to_rgb(hue, saturation, value))


image = Image.new("RGB", (WIDTH, HEIGHT), (188, 206, 214))
draw = ImageDraw.Draw(image)

owner_by_id = {province["id"]: province["initialOwnerTag"] for province in BUNDLE["provinces"]}

for province in BUNDLE["provinces"]:
    fill = color_for(province["initialOwnerTag"])
    rings = province["rings"]
    holes = set(province["holes"])
    for index, ring in enumerate(rings):
        if index in holes:
            continue
        points = [project(lon, lat) for lon, lat in decode(ring)]
        if len(points) >= 3:
            draw.polygon(points, fill=fill)

# Internal province edges: thin light lines. International edges: stronger dark.
for border in BUNDLE["borders"]:
    a = border["a"]
    b = border["b"]
    national = b >= 0 and owner_by_id.get(a) != owner_by_id.get(b)
    width = 3 if national else 1
    color = (22, 32, 40) if national else (250, 248, 240)
    for line in border["lines"]:
        points = [project(lon, lat) for lon, lat in decode(line)]
        if len(points) >= 2:
            draw.line(points, fill=color, width=width)

OUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUT)
print(f"wrote {OUT} ({WIDTH}x{HEIGHT}) provinces={len(BUNDLE['provinces'])}")
