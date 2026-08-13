from pathlib import Path

import cv2
import numpy as np


SOURCE = Path(r"C:\Users\yasan\Downloads\images\logogh (1).png")
OUTPUT = Path(__file__).with_name("logogh-responsive.svg")

COLORS = (
    ("brand-red", "#b30303", (179, 3, 3)),
    ("brand-gold", "#f7c600", (247, 198, 0)),
    ("logo-foreground", "#000000", (0, 0, 0)),
    ("brand-green", "#2a7500", (42, 117, 0)),
)


def fmt(value: float) -> str:
    rounded = round(value, 2)
    if rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:.2f}".rstrip("0").rstrip(".")


def trace_mask(mask: np.ndarray, scale: int = 4) -> str:
    enlarged = cv2.resize(
        mask,
        (mask.shape[1] * scale, mask.shape[0] * scale),
        interpolation=cv2.INTER_CUBIC,
    )
    binary = np.where(enlarged >= 128, 255, 0).astype(np.uint8)
    contours, _ = cv2.findContours(
        binary,
        cv2.RETR_LIST,
        cv2.CHAIN_APPROX_NONE,
    )

    paths = []
    for contour in contours:
        if abs(cv2.contourArea(contour)) < scale * scale:
            continue
        simplified = cv2.approxPolyDP(contour, epsilon=0.55, closed=True)
        points = simplified.reshape(-1, 2).astype(np.float64) / scale
        commands = [f"M{fmt(points[0, 0])} {fmt(points[0, 1])}"]
        commands.extend(
            f"L{fmt(x)} {fmt(y)}" for x, y in points[1:]
        )
        commands.append("Z")
        paths.append("".join(commands))

    return "".join(paths)


def main() -> None:
    image = cv2.imread(str(SOURCE), cv2.IMREAD_UNCHANGED)
    if image is None or image.shape[2] != 4:
        raise RuntimeError(f"Could not read an RGBA image from {SOURCE}")

    bgra = image
    rgb = cv2.cvtColor(bgra[:, :, :3], cv2.COLOR_BGR2RGB)
    alpha = bgra[:, :, 3]
    height, width = alpha.shape

    groups = []
    for class_name, fill, target in COLORS:
        color_match = np.all(rgb == np.array(target, dtype=np.uint8), axis=2)
        mask = np.where(color_match, alpha, 0).astype(np.uint8)
        path_data = trace_mask(mask)
        if not path_data:
            raise RuntimeError(f"No paths were traced for {class_name}")
        groups.append(
            f'  <path class="{class_name}" fill="{fill}" '
            f'fill-rule="evenodd" d="{path_data}"/>'
        )

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 {width} {height}"
     role="img"
     aria-labelledby="logo-title logo-description">
  <title id="logo-title">Ghana TBS</title>
  <desc id="logo-description">Ghana TBS logo in red, gold, black or white, and green</desc>
  <style>
    .logo-foreground {{ fill: var(--logo-foreground, #000000); }}
    @media (prefers-color-scheme: dark) {{
      .logo-foreground {{ fill: var(--logo-foreground-dark, #ffffff); }}
    }}
  </style>
{chr(10).join(groups)}
</svg>
'''
    OUTPUT.write_text(svg, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
