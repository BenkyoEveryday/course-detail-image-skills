---
name: embed-real-images-no-ps
description: Deterministically embed real screenshots or photos into rectangular or four-point perspective placeholder regions of a flattened visual design without Photoshop and without AI redrawing the source content. Use when Codex must place Word-extracted images, courseware screenshots, product images, document pages, or other text-sensitive raster assets into generated poster/detail-page cards, tilted phone screens, tablets, books, boards, or mockups while preserving readable source information, exact ordering, borders, bezels, number tabs, shadows, labels, and foreground occlusion.
---

# Embed Real Images Without Photoshop

Create the final raster by deterministic scaling, cropping, compositing, and alpha masks. Never send text-sensitive source images through an image-generation or image-editing model.

## Layer Model

Build the result in this order:

1. Keep the original design as the bottom layer.
2. Place source images over the measured placeholder interiors.
3. Put a copy of the original design on top.
4. Cut transparent holes in that top copy only where source content should show.
5. Restore number tabs, labels, borders, shadows, and foreground decorations in the top mask.

This model is mandatory for a flattened PNG because its visual elements cannot be recovered as separate layers.

## Workflow

1. Inspect the base and every source image at original resolution. Confirm dimensions and source order.
2. Measure the complete visible inner opening, not a smaller centre safe area and not the outer shadow. Record rectangular geometry as `opening`. For repeated grids, verify every row independently; generated cards that look similar may have different dimensions. For a tilted surface, measure the four visible inner corners in top-left, top-right, bottom-right, bottom-left order.
3. Fill every opening completely. Preserve the source aspect ratio and use centred `cover` whenever source and opening ratios differ: scale until both dimensions cover the opening, centre-align the source, and crop only the excess outside the opening. Never stretch. `contain` is allowed only when the ratios already match closely enough to leave no visible band.
4. Define one slot per source in a JSON config. Use rectangular geometry for front-facing cards and `quad` geometry for perspective surfaces. Add `protect` shapes for any number tab, bezel, title label, icon, person, plant, scroll, or other foreground object overlapping a slot. Treat every title or category label attached to the top edge of a placeholder as foreground by default, even when it sits partly inside the measured image opening.
5. Run `scripts/embed-real-images.cjs` with the base, config, and PNG output paths.
6. Inspect the output with `view_image` at original detail. Do not deliver an unchecked first pass.
7. Adjust coordinates or protection shapes until all acceptance checks pass.

## Config Format

Create the task-specific config in the user's workspace, not inside this skill.

```json
{
  "slots": [
    {
      "source": "/absolute/path/source.png",
      "opening": {
        "x": 62,
        "y": 605,
        "width": 432,
        "height": 255
      },
      "radius": 13,
      "fit": "cover",
      "position": "centre",
      "protect": [
        {
          "type": "polygon",
          "points": [[69, 600], [126, 600], [126, 642], [98, 658], [69, 642]]
        }
      ]
    }
  ]
}
```

Supported protection shapes:

- `rect`: `x`, `y`, `width`, `height`, optional `radius`
- `ellipse`: `x`, `y`, `width`, `height`
- `polygon`: `points` as coordinate pairs

Coordinates use the base image's pixel coordinate system. `opening` must cover the whole area inside the visible frame. Legacy top-level `x`, `y`, `width`, and `height` remain supported, but new configs should use `opening` so the measurement cannot be confused with a smaller content-safe area.

Never change `opening` to the source aspect ratio merely to avoid `contain` bars. If the measured opening is larger than the inserted image even though source and configured ratios match, the opening was measured too small. Remeasure the base image.

When ratios differ, the script overrides `contain`, `inside`, and non-centred positions with centred `cover`. Cropping must be symmetrical around the source centre. If centred cropping removes essential text or factual content, regenerate the placeholder at the source ratio; do not switch back to letterboxing and do not stretch the image.

For a perspective phone, tablet, book page, board, or mockup, replace rectangular geometry with a four-point quad:

```json
{
  "source": "/absolute/path/screenshot.png",
  "quad": [[245, 636], [506, 642], [509, 1229], [237, 1221]],
  "fit": "cover",
  "position": "centre",
  "sourceRadius": 18,
  "sampling": "bicubic",
  "textSensitive": true,
  "renderScale": 3,
  "sharpen": true,
  "sharpenSigma": 0.6
}
```

List `quad` points strictly as top-left, top-right, bottom-right, bottom-left. Place the points on the inner content boundary, not the outer phone or frame edge. Use `sourceRadius` in final-image pixels to match the inner screen radius, not the outer device radius. Keep `sampling` at `bicubic` for text, UI, tables, and screenshots; use `bilinear` only for soft photographic material and set `textSensitive` to `false` for photos.

For text-sensitive perspective sources, the script samples the original source directly into a high-resolution projected layer, then downsamples once with Lanczos and applies a light local sharpen. Use integer `renderScale` values from `1` to `4`; `3` is the default for text and `2` for photos. Keep `sharpenSigma` near `0.6`; stronger values can create halos around Chinese characters. `resolutionScale` remains accepted only as a compatibility alias for older configs. Supersampling reduces avoidable transformation softness but cannot restore detail beyond the final visible pixel count. Set optional `planeWidth` and `planeHeight` only when the visible plane's intended aspect ratio cannot be inferred from its four edges.

## Run

Use the bundled workspace Node runtime when available. The script loads `sharp` from the workspace runtime or a normal local installation.

```bash
node scripts/embed-real-images.cjs \
  --base /absolute/path/base.png \
  --config /absolute/path/slots.json \
  --output /absolute/path/result.png \
  --qa-dir /absolute/path/qa-crops
```

Use `--mask-preview /absolute/path/mask.png` when diagnosing a wrong cutout or lost foreground object. Keep `--qa-dir` enabled for perspective jobs; it writes a nearest-neighbour 2x crop for each slot so inspection magnifies existing pixels without introducing another smoothing pass.

## Acceptance Checks

Verify all of the following:

- Source text, diagrams, people, and factual content are not redrawn or regenerated.
- Sources follow the requested order.
- Every source fills its complete intended inner frame without stretching.
- No placeholder-colour band or unfilled margin remains between the embedded source and the measured inner frame.
- Ratio mismatch is handled by centred edge cropping only; crop amounts are balanced on opposite sides.
- The configured `opening` matches the complete visual opening rather than a source-sized rectangle centred inside it.
- Outer borders, rounded corners, shadows, and number tabs remain visible.
- Every placeholder title, category tab, and caption remains fully visible above the embedded source; no source page may cover even part of a title glyph or its backing label.
- Perspective edges align with all four inner-frame edges, without rectangular overflow or uncovered wedges.
- Phone or tablet screenshots remain inside the bezel and follow the device's tilt and taper.
- Inner-screen corner radii match the visible screen opening; source corners do not cover the bezel or leave wedge-shaped gaps.
- Status bars and Home indicators follow the same perspective as the corresponding top and bottom screen edges.
- Foreground objects keep the intended above/below relationship.
- No white rectangular patches appear around protected labels or icons.
- The output dimensions exactly match the base image.
- Small text remains readable at the practical delivery resolution.

For every perspective result, inspect both the whole image and every `--qa-dir` 2x crop. Reject the result if the crop shows avoidable resampling softness, doubled Home indicators, exposed placeholder content, one-pixel seams, mismatched corner radii, sharpening halos, or source content crossing the bezel. Adjust the four points independently; do not move or scale the whole quad as a substitute for corner correction.

## Guardrails

- Do not use Photoshop, image-generation editing, HTML, Canvas, PowerPoint, or PIL for this workflow.
- Do not call an image model to "blend" a real screenshot; it can mutate text and details.
- Do not stretch front-facing sources. Preserve aspect ratio and use centred `cover`; allow only the requested projective deformation for `quad` slots.
- Do not make the placement rectangle smaller to protect titles, paper clips, plants, microscopes, labels, or other foreground objects. Measure the full opening, then restore those objects with `protect` shapes.
- Do not use `contain` when ratios differ. The script automatically replaces it with centred `cover` so the opening is filled.
- Do not guess complex occlusion from a low-resolution preview. Inspect the full-resolution base.
- Do not solve a covered title by shrinking or moving the source unless the source is genuinely misaligned. Preserve source geometry and restore the title with a tightly measured `protect` rectangle or polygon.
- Treat a source as immutable. Only scale, crop, and resample it for placement.
- If the user forbids all deterministic programmatic compositing as well as Photoshop, explain that exact automated preservation is not possible under those combined constraints.

## Limitations

A flattened base cannot reveal its original layer geometry. Perspective corners and complex hair, hands, scrolls, bezels, or irregular foreground overlaps require manually measured quad or polygon coordinates. Strong perspective reduces text legibility because the visible plane itself contains fewer pixels. This skill produces a final PNG, not a layered design document.
