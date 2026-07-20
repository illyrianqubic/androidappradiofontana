#!/usr/bin/env python3
"""Generate the iOS LightIcon alternate app-icon set.

Renders the full iPhone appiconset size matrix from the existing light
launcher source (assets/images/applogortvfontana.png) into
assets/app-icons/ios/LightIcon/. The config plugin
(plugins/with-dynamic-app-icon.js) copies these files into
ios/<ProjectName>/Images.xcassets/LightIcon.appiconset during prebuild and
sets ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES=LightIcon, so actool
generates the CFBundleAlternateIcons Info.plist entry at build time.

App-icon hard requirements handled here:
  - no alpha channel (App Store rejects icons with transparency) -> RGB
  - opaque background -> flattened onto white (the light variant's bg)
  - exact point sizes @2x/@3x + 1024 marketing icon
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "images" / "applogortvfontana.png"
OUT_DIR = ROOT / "assets" / "app-icons" / "ios" / "LightIcon"

# (filename, pixel size) — full iPhone appiconset matrix + marketing icon.
SIZES = [
    ("Icon-App-20x20@2x.png", 40),
    ("Icon-App-20x20@3x.png", 60),
    ("Icon-App-29x29@2x.png", 58),
    ("Icon-App-29x29@3x.png", 87),
    ("Icon-App-40x40@2x.png", 80),
    ("Icon-App-40x40@3x.png", 120),
    ("Icon-App-60x60@2x.png", 120),
    ("Icon-App-60x60@3x.png", 180),
    ("Icon-App-1024x1024@1x.png", 1024),
]


def flatten_on_white(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    canvas = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    canvas.paste(rgba, (0, 0), rgba)
    return canvas.convert("RGB")


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing light icon source: {SOURCE}")
    base = flatten_on_white(Image.open(SOURCE))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for filename, size in SIZES:
        icon = base.resize((size, size), Image.Resampling.LANCZOS)
        dest = OUT_DIR / filename
        icon.save(dest, "PNG")
        print(f"wrote {dest.relative_to(ROOT)} ({size}x{size})")
    print("Done. Commit these files; the config plugin copies them at prebuild.")


if __name__ == "__main__":
    main()
