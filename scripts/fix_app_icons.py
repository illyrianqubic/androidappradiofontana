#!/usr/bin/env python3
"""Center app-icon logos and regenerate Android mipmap WebPs."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
APP_ICONS = ASSETS / "app-icons"

DPI_VALUES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]
# (launcher size in px, adaptive foreground size in px) per density
DPI_SIZES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}


def trim_background(img: Image.Image, bg: tuple[int, int, int] | None, tolerance: int = 0) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Return cropped logo and its original bbox relative to the image."""
    rgba = img.convert("RGBA")
    if bg is None:
        # Trim transparent pixels.
        bbox = rgba.getbbox()
    else:
        # Create mask: keep pixels that differ from bg by more than tolerance.
        r, g, b = bg
        data = list(rgba.getdata())
        mask_data = [
            (255, 255, 255, 255)
            if max(abs(px[0] - r), abs(px[1] - g), abs(px[2] - b)) > tolerance
            else (0, 0, 0, 0)
            for px in data
        ]
        mask = Image.new("RGBA", rgba.size)
        mask.putdata(mask_data)
        bbox = mask.getbbox()

    if bbox is None:
        raise RuntimeError("No logo found — image is empty or matches background exactly")

    return rgba.crop(bbox), bbox


def center_logo(src_path: Path, canvas_size: int, bg: tuple[int, int, int] | None, tolerance: int = 0) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Load source, trim, and center the logo on a new canvas."""
    img = Image.open(src_path)
    logo, before_bbox = trim_background(img, bg, tolerance)

    if bg is None:
        canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", (canvas_size, canvas_size), (*bg, 255))

    x = (canvas_size - logo.width) // 2
    y = (canvas_size - logo.height) // 2
    canvas.paste(logo, (x, y), logo)

    # Save with original mode intent: keep alpha for foregrounds, RGB for solid backgrounds.
    if bg is None:
        canvas = canvas.convert("RGBA")
    else:
        canvas = canvas.convert("RGB")

    return canvas, before_bbox


def save_webp(img: Image.Image, dest: Path, quality: int = 95) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "WEBP", quality=quality, method=6)


def regenerate_set(variant: str, launcher_src: Path, foreground_src: Path, bg: tuple[int, int, int] | None) -> None:
    """Regenerate all densities for one variant (dark or light)."""
    launcher_canvas, _ = center_logo(launcher_src, launcher_src == Path("dummy") and 1024 or Image.open(launcher_src).size[0], bg, tolerance=10)
    foreground_canvas, _ = center_logo(foreground_src, foreground_src == Path("dummy") and 1024 or Image.open(foreground_src).size[0], None, tolerance=10)

    for dpi, (launcher_size, foreground_size) in DPI_SIZES.items():
        out_dir = APP_ICONS / variant / dpi
        out_dir.mkdir(parents=True, exist_ok=True)

        launcher = launcher_canvas.resize((launcher_size, launcher_size), Image.Resampling.LANCZOS)
        foreground = foreground_canvas.resize((foreground_size, foreground_size), Image.Resampling.LANCZOS)

        if variant == "dark":
            save_webp(launcher, out_dir / "ic_launcher.webp")
            save_webp(launcher, out_dir / "ic_launcher_round.webp")
            save_webp(foreground, out_dir / "ic_launcher_foreground.webp")
        else:
            save_webp(launcher, out_dir / "ic_launcher_light.webp")
            save_webp(launcher, out_dir / "ic_launcher_light_round.webp")
            save_webp(foreground, out_dir / "ic_launcher_foreground_light.webp")


def main() -> None:
    report: list[str] = []

    # --- Fix source images ---
    sources = [
        (ASSETS / "images" / "darklogortvfontana.png", 1024, (0x0B, 0x12, 0x20), "dark launcher source"),
        (ASSETS / "adaptive-icon-foreground-dark.png", 1024, None, "dark adaptive foreground source"),
        (ASSETS / "images" / "applogortvfontana.png", 1280, (0xFF, 0xFF, 0xFF), "light launcher source"),
    ]

    for src_path, size, bg, label in sources:
        centered, before_bbox = center_logo(src_path, size, bg, tolerance=10)
        centered.save(src_path)
        _, after_bbox = trim_background(centered, bg, tolerance=10)
        report.append(f"{label}: {src_path}")
        report.append(f"  before bbox: {before_bbox}")
        report.append(f"  after bbox:  {after_bbox}")
        report.append("")

    # Also center the light foreground source (used only for generation, not saved back as a source).
    light_fg_src = ASSETS / "images" / "logo-blue-transparent.png"
    light_fg_canvas, light_fg_before = center_logo(light_fg_src, 1280, None, tolerance=10)

    # --- Regenerate app-icons ---
    regenerate_set(
        "dark",
        ASSETS / "images" / "darklogortvfontana.png",
        ASSETS / "adaptive-icon-foreground-dark.png",
        (0x0B, 0x12, 0x20),
    )

    for dpi, (launcher_size, foreground_size) in DPI_SIZES.items():
        out_dir = APP_ICONS / "light" / dpi
        out_dir.mkdir(parents=True, exist_ok=True)

        # Light launcher from centered applogortvfontana.png
        launcher_src = ASSETS / "images" / "applogortvfontana.png"
        launcher_canvas, _ = center_logo(launcher_src, 1280, (0xFF, 0xFF, 0xFF), tolerance=10)
        launcher = launcher_canvas.resize((launcher_size, launcher_size), Image.Resampling.LANCZOS)
        save_webp(launcher, out_dir / "ic_launcher_light.webp")
        save_webp(launcher, out_dir / "ic_launcher_light_round.webp")

        # Light foreground from centered logo-blue-transparent.png
        foreground = light_fg_canvas.resize((foreground_size, foreground_size), Image.Resampling.LANCZOS)
        save_webp(foreground, out_dir / "ic_launcher_foreground_light.webp")

    report.append("Regenerated app-icons for dark and light variants at all densities.")
    print("\n".join(report))


if __name__ == "__main__":
    main()
