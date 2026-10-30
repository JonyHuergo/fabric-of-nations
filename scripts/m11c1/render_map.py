"""Render committed M11c.1 map bundles to PNG for visual smoke tests.

Usage:
  python scripts/m11c1/render_map.py <map.json> <out.png> <lon_min,lat_min,lon_max,lat_max> [width]

Uses the same Miller projection and even-odd ring semantics as the app. This is a
screenshot/smoke renderer, not a survey map.
"""
import json
import math
import sys
from PIL import Image, ImageDraw

MAP_W = 1000.0
MAP_H = 500.0


def miller(lat):
    lat = max(-89.9, min(89.9, lat))
    return 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat)))


MMAX = miller(89.9)


def project(lon, lat):
    x = ((lon + 180.0) / 360.0) * MAP_W
    y = ((MMAX - miller(lat)) / (2.0 * MMAX)) * MAP_H
    return x, y


def decode(flat):
    pts = []
    x = y = 0
    for i in range(0, len(flat), 2):
        x += flat[i]
        y += flat[i + 1]
        pts.append((x / 1000.0, y / 1000.0))
    return pts


def main():
    path, out, bbox = sys.argv[1], sys.argv[2], sys.argv[3]
    width = int(sys.argv[4]) if len(sys.argv) > 4 else 1400
    lon0, lat0, lon1, lat1 = (float(v) for v in bbox.split(","))
    data = json.load(open(path, "r", encoding="utf-8"))
    height = max(300, min(2200, int(width * (lat1 - lat0) / max(1e-9, lon1 - lon0) * 0.62)))
    img = Image.new("RGB", (width, height), (8, 17, 26))
    draw = ImageDraw.Draw(img)
    for lon in range(-180, 181, 30):
        if lon0 <= lon <= lon1:
            draw.line([((lon - lon0) / (lon1 - lon0) * width, 0),
                       ((lon - lon0) / (lon1 - lon0) * width, height)], fill=(18, 32, 42))
    for lat in range(-60, 85, 30):
        if lat0 <= lat <= lat1:
            draw.line([(0, (lat1 - lat) / (lat1 - lat0) * height),
                       (width, (lat1 - lat) / (lat1 - lat0) * height)], fill=(18, 32, 42))

    def xf(lon, lat):
        px0, py0 = project(lon0, lat1)
        px1, py1 = project(lon1, lat0)
        return (
            (project(lon, lat)[0] - px0) / max(1e-9, px1 - px0) * width,
            (project(lon, lat)[1] - py0) / max(1e-9, py1 - py0) * height,
        )

    for flat in data.get("land", []):
        pts = decode(flat)
        if len(pts) < 3:
            continue
        for off in (-360, 0, 360):
            draw.polygon([xf(lon + off, lat) for lon, lat in pts], fill=(26, 35, 40))

    palette = [
        (84, 120, 150), (150, 120, 84), (120, 150, 100), (150, 100, 120),
        (100, 140, 130), (140, 130, 100), (110, 110, 160), (160, 110, 110),
        (100, 150, 160), (150, 140, 110), (130, 160, 120), (160, 120, 140),
        (90, 130, 110), (130, 110, 90), (110, 130, 160), (160, 130, 90),
    ]
    for idx, polity in enumerate(data["polities"]):
        rings = polity.get("rings", [])
        if not rings:
            continue
        holes = set(polity.get("holes", []))
        mask = Image.new("L", (width, height), 0)
        md = ImageDraw.Draw(mask)
        anypoly = False
        for ri, flat in enumerate(rings):
            pts = decode(flat)
            if len(pts) < 3:
                continue
            color = 0 if ri in holes else 255
            for off in (-360, 0, 360):
                poly = [xf(lon + off, lat) for lon, lat in pts]
                if max(x for x, _ in poly) < -10 or min(x for x, _ in poly) > width + 10:
                    continue
                md.polygon(poly, fill=color)
                anypoly = True
        if not anypoly:
            continue
        layer = Image.new("RGB", (width, height), palette[idx % len(palette)])
        img = Image.composite(layer, img, mask)
        draw = ImageDraw.Draw(img)
        for flat in rings:
            pts = decode(flat)
            if len(pts) < 3:
                continue
            for off in (-360, 0, 360):
                poly = [xf(lon + off, lat) for lon, lat in pts]
                draw.line(poly, fill=(5, 9, 12), width=1)

    # Map-only disputed/no-administration zones: translucent amber + dashed outline.
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for area in data.get("disputedAreas", []):
        for flat in area.get("rings", []):
            pts = decode(flat)
            if len(pts) < 3:
                continue
            for off in (-360, 0, 360):
                poly = [xf(lon + off, lat) for lon, lat in pts]
                od.polygon(poly, fill=(216, 179, 74, 70), outline=(216, 179, 74, 235), width=2)
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    img.save(out)
    print(f"wrote {out} {width}x{height}")


if __name__ == "__main__":
    main()
