#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

function loadSharp() {
  const candidates = [
    "sharp",
    process.env.CODEX_NODE_MODULES && path.join(process.env.CODEX_NODE_MODULES, "sharp"),
    path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_) {
      // Try the next known workspace location.
    }
  }
  throw new Error("The sharp image library is unavailable. Load workspace dependencies or install sharp locally.");
}

function usage() {
  return [
    "Usage:",
    "  embed-real-images.cjs --base BASE.png --config slots.json --output RESULT.png",
    "  [--mask-preview MASK.png] [--qa-dir DIRECTORY]",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (!key.startsWith("--") || i + 1 >= argv.length) {
      throw new Error(`Invalid argument: ${key}\n${usage()}`);
    }
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

function assertNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
}

function validatePoint(point, label) {
  if (!Array.isArray(point) || point.length !== 2) throw new Error(`${label} must be an [x, y] pair.`);
  assertNumber(point[0], `${label}[0]`);
  assertNumber(point[1], `${label}[1]`);
}

function validateShape(shape, label) {
  if (!shape || !["rect", "ellipse", "polygon"].includes(shape.type)) {
    throw new Error(`${label}.type must be rect, ellipse, or polygon.`);
  }
  if (shape.type === "polygon") {
    if (!Array.isArray(shape.points) || shape.points.length < 3) {
      throw new Error(`${label}.points must contain at least three coordinate pairs.`);
    }
    shape.points.forEach((point, index) => {
      if (!Array.isArray(point) || point.length !== 2) throw new Error(`${label}.points[${index}] is invalid.`);
      assertNumber(point[0], `${label}.points[${index}][0]`);
      assertNumber(point[1], `${label}.points[${index}][1]`);
    });
    return;
  }
  for (const key of ["x", "y", "width", "height"]) assertNumber(shape[key], `${label}.${key}`);
}

function rectGeometry(slot) {
  return slot.opening || slot;
}

function validateConfig(config, baseWidth, baseHeight) {
  if (!config || !Array.isArray(config.slots) || config.slots.length === 0) {
    throw new Error("Config must contain a non-empty slots array.");
  }
  config.slots.forEach((slot, index) => {
    const label = `slots[${index}]`;
    if (!slot.source || !fs.existsSync(slot.source)) throw new Error(`${label}.source does not exist: ${slot.source}`);
    if (slot.quad) {
      if (!Array.isArray(slot.quad) || slot.quad.length !== 4) {
        throw new Error(`${label}.quad must contain four points in TL, TR, BR, BL order.`);
      }
      slot.quad.forEach((point, pointIndex) => {
        validatePoint(point, `${label}.quad[${pointIndex}]`);
        if (point[0] < 0 || point[1] < 0 || point[0] > baseWidth || point[1] > baseHeight) {
          throw new Error(`${label}.quad[${pointIndex}] lies outside the ${baseWidth}x${baseHeight} base image.`);
        }
      });
      const area = Math.abs(slot.quad.reduce((sum, point, pointIndex) => {
        const next = slot.quad[(pointIndex + 1) % 4];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0) / 2);
      if (area < 4) throw new Error(`${label}.quad has insufficient area.`);
      for (const key of ["planeWidth", "planeHeight", "sourceRadius", "resolutionScale", "renderScale", "sharpenSigma"]) {
        if (slot[key] !== undefined) assertNumber(slot[key], `${label}.${key}`);
      }
      if (slot.planeWidth !== undefined && slot.planeWidth <= 1) throw new Error(`${label}.planeWidth must exceed 1.`);
      if (slot.planeHeight !== undefined && slot.planeHeight <= 1) throw new Error(`${label}.planeHeight must exceed 1.`);
      if (slot.sourceRadius !== undefined && slot.sourceRadius < 0) throw new Error(`${label}.sourceRadius cannot be negative.`);
      if (slot.resolutionScale !== undefined && (slot.resolutionScale < 1 || slot.resolutionScale > 4)) {
        throw new Error(`${label}.resolutionScale must be between 1 and 4.`);
      }
      if (slot.renderScale !== undefined && (!Number.isInteger(slot.renderScale) || slot.renderScale < 1 || slot.renderScale > 4)) {
        throw new Error(`${label}.renderScale must be an integer between 1 and 4.`);
      }
      if (slot.sharpenSigma !== undefined && (slot.sharpenSigma <= 0 || slot.sharpenSigma > 3)) {
        throw new Error(`${label}.sharpenSigma must be greater than 0 and at most 3.`);
      }
      if (slot.sharpen !== undefined && typeof slot.sharpen !== "boolean") {
        throw new Error(`${label}.sharpen must be true or false.`);
      }
      if (slot.sampling && !["bicubic", "bilinear"].includes(slot.sampling)) {
        throw new Error(`${label}.sampling must be bicubic or bilinear.`);
      }
      if (slot.textSensitive !== undefined && typeof slot.textSensitive !== "boolean") {
        throw new Error(`${label}.textSensitive must be true or false.`);
      }
    } else {
      if (slot.opening && (typeof slot.opening !== "object" || Array.isArray(slot.opening))) {
        throw new Error(`${label}.opening must be a rectangle object.`);
      }
      const rect = rectGeometry(slot);
      const rectLabel = slot.opening ? `${label}.opening` : label;
      for (const key of ["x", "y", "width", "height"]) assertNumber(rect[key], `${rectLabel}.${key}`);
      if (rect.width <= 0 || rect.height <= 0) throw new Error(`${rectLabel} dimensions must be positive.`);
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > baseWidth || rect.y + rect.height > baseHeight) {
        throw new Error(`${label} lies outside the ${baseWidth}x${baseHeight} base image.`);
      }
    }
    if (slot.fit === "fill") {
      throw new Error(`${label}.fit cannot be fill because stretching source images is forbidden; use cover.`);
    }
    if (slot.fit && !["cover", "contain", "inside", "outside"].includes(slot.fit)) {
      throw new Error(`${label}.fit is unsupported: ${slot.fit}`);
    }
    (slot.protect || []).forEach((shape, shapeIndex) => validateShape(shape, `${label}.protect[${shapeIndex}]`));
  });
}

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function solveLinearSystem(matrix, values) {
  const size = values.length;
  const rows = matrix.map((row, index) => row.slice().concat(values[index]));
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-10) throw new Error("Perspective quad is singular or self-intersecting.");
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let k = column; k <= size; k += 1) rows[column][k] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let k = column; k <= size; k += 1) rows[row][k] -= factor * rows[column][k];
    }
  }
  return rows.map((row) => row[size]);
}

function homography(from, to) {
  const matrix = [];
  const values = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  }
  return solveLinearSystem(matrix, values).concat(1);
}

function bilinearSample(data, width, height, x, y, output, offset) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const samples = [
    [x0, y0, (1 - fx) * (1 - fy)],
    [x1, y0, fx * (1 - fy)],
    [x0, y1, (1 - fx) * fy],
    [x1, y1, fx * fy],
  ];
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const [sx, sy, weight] of samples) {
    const sourceOffset = (sy * width + sx) * 4;
    const weightedAlpha = data[sourceOffset + 3] * weight;
    alpha += weightedAlpha;
    red += data[sourceOffset] * weightedAlpha;
    green += data[sourceOffset + 1] * weightedAlpha;
    blue += data[sourceOffset + 2] * weightedAlpha;
  }
  output[offset + 3] = Math.round(alpha);
  if (alpha > 0) {
    output[offset] = Math.round(red / alpha);
    output[offset + 1] = Math.round(green / alpha);
    output[offset + 2] = Math.round(blue / alpha);
  }
}

function cubicWeight(value) {
  const x = Math.abs(value);
  const a = -0.5;
  if (x <= 1) return (a + 2) * x * x * x - (a + 3) * x * x + 1;
  if (x < 2) return a * x * x * x - 5 * a * x * x + 8 * a * x - 4 * a;
  return 0;
}

function bicubicSample(data, width, height, x, y, output, offset) {
  const baseX = Math.floor(x);
  const baseY = Math.floor(y);
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let row = -1; row <= 2; row += 1) {
    const sampleY = Math.max(0, Math.min(height - 1, baseY + row));
    const weightY = cubicWeight(y - (baseY + row));
    for (let column = -1; column <= 2; column += 1) {
      const sampleX = Math.max(0, Math.min(width - 1, baseX + column));
      const weight = weightY * cubicWeight(x - (baseX + column));
      if (weight === 0) continue;
      const sourceOffset = (sampleY * width + sampleX) * 4;
      const weightedAlpha = data[sourceOffset + 3] * weight;
      alpha += weightedAlpha;
      red += data[sourceOffset] * weightedAlpha;
      green += data[sourceOffset + 1] * weightedAlpha;
      blue += data[sourceOffset + 2] * weightedAlpha;
    }
  }
  alpha = Math.max(0, Math.min(255, alpha));
  output[offset + 3] = Math.round(alpha);
  if (alpha > 0) {
    output[offset] = Math.max(0, Math.min(255, Math.round(red / alpha)));
    output[offset + 1] = Math.max(0, Math.min(255, Math.round(green / alpha)));
    output[offset + 2] = Math.max(0, Math.min(255, Math.round(blue / alpha)));
  }
}

function positionFactors(position) {
  const value = String(position || "centre").toLowerCase();
  let x = 0.5;
  let y = 0.5;
  if (["left", "west", "northwest", "southwest"].includes(value)) x = 0;
  if (["right", "east", "northeast", "southeast"].includes(value)) x = 1;
  if (["top", "north", "northwest", "northeast"].includes(value)) y = 0;
  if (["bottom", "south", "southwest", "southeast"].includes(value)) y = 1;
  return { x, y };
}

function insideRoundedRect(x, y, width, height, radius) {
  if (x < 0 || y < 0 || x > width || y > height) return false;
  if (!radius) return true;
  const r = Math.min(radius, width / 2, height / 2);
  const nearestX = Math.max(r, Math.min(width - r, x));
  const nearestY = Math.max(r, Math.min(height - r, y));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= r ** 2;
}

function writeColor(output, offset, color) {
  output[offset] = color.r;
  output[offset + 1] = color.g;
  output[offset + 2] = color.b;
  output[offset + 3] = Math.round((color.alpha === undefined ? 1 : color.alpha) * 255);
}

function slotBounds(slot, canvasWidth, canvasHeight, padding = 12) {
  const rect = rectGeometry(slot);
  const points = slot.quad || [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ];
  const left = Math.max(0, Math.floor(Math.min(...points.map((point) => point[0])) - padding));
  const top = Math.max(0, Math.floor(Math.min(...points.map((point) => point[1])) - padding));
  const right = Math.min(canvasWidth, Math.ceil(Math.max(...points.map((point) => point[0])) + padding));
  const bottom = Math.min(canvasHeight, Math.ceil(Math.max(...points.map((point) => point[1])) + padding));
  return { left, top, width: right - left, height: bottom - top };
}

function resolveFillPolicy(slot, sourceWidth, sourceHeight, targetWidth, targetHeight, index) {
  const sourceRatio = sourceWidth / sourceHeight;
  const openingRatio = targetWidth / targetHeight;
  const fitFraction = Math.min(sourceRatio / openingRatio, openingRatio / sourceRatio);
  const mismatch = 1 - fitFraction;
  const requestedFit = slot.fit || "cover";
  const label = `slots[${index}] ${path.basename(slot.source)}`;
  if (mismatch > 0.002 && (requestedFit === "contain" || requestedFit === "inside")) {
    console.warn(
      `Warning: ${label} requested ${requestedFit}, but source ratio ${sourceRatio.toFixed(3)} differs from opening ${openingRatio.toFixed(3)}. ` +
      `Switching to centred cover so the opening is filled; approximately ${(mismatch * 100).toFixed(1)}% is cropped by aspect ratio.`
    );
  }
  if (mismatch > 0.002 && ![undefined, "centre", "center"].includes(slot.position)) {
    console.warn(
      `Warning: ${label} has a non-centred position, but aspect-ratio cropping must be centred. Overriding position with centre.`
    );
  }
  return {
    fit: mismatch > 0.002 ? "cover" : (["inside"].includes(requestedFit) ? "contain" : ["outside"].includes(requestedFit) ? "cover" : requestedFit),
    position: "centre",
    mismatch,
  };
}

async function makePerspectiveLayer(slot, sharp, canvasWidth, canvasHeight) {
  const topWidth = distance(slot.quad[0], slot.quad[1]);
  const bottomWidth = distance(slot.quad[3], slot.quad[2]);
  const leftHeight = distance(slot.quad[0], slot.quad[3]);
  const rightHeight = distance(slot.quad[1], slot.quad[2]);
  const visibleWidth = (topWidth + bottomWidth) / 2;
  if (slot.textSensitive !== false && visibleWidth < 320) {
    console.warn(`Warning: ${path.basename(slot.source)} projects to about ${Math.round(visibleWidth)} px wide; small text cannot remain fully readable at this output size.`);
  }
  const planeWidth = Math.max(2, slot.planeWidth || (topWidth + bottomWidth) / 2);
  const planeHeight = Math.max(2, slot.planeHeight || (leftHeight + rightHeight) / 2);
  const renderScale = slot.renderScale || slot.resolutionScale || (slot.textSensitive === false ? 2 : 3);
  const raw = await sharp(slot.source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sourceWidth = raw.info.width;
  const sourceHeight = raw.info.height;
  const policy = resolveFillPolicy(slot, sourceWidth, sourceHeight, planeWidth, planeHeight, slot.index ?? "perspective");
  const fit = policy.fit;
  const factors = positionFactors(policy.position);
  let fitScale;
  if (fit === "contain" || fit === "inside") {
    fitScale = Math.min(planeWidth / sourceWidth, planeHeight / sourceHeight);
  } else {
    fitScale = Math.max(planeWidth / sourceWidth, planeHeight / sourceHeight);
  }
  const fittedWidth = sourceWidth * fitScale;
  const fittedHeight = sourceHeight * fitScale;
  const fittedX = (planeWidth - fittedWidth) * factors.x;
  const fittedY = (planeHeight - fittedHeight) * factors.y;
  const background = slot.background || { r: 255, g: 255, b: 255, alpha: 1 };
  const minX = Math.max(0, Math.floor(Math.min(...slot.quad.map((point) => point[0]))));
  const minY = Math.max(0, Math.floor(Math.min(...slot.quad.map((point) => point[1]))));
  const maxX = Math.min(canvasWidth, Math.ceil(Math.max(...slot.quad.map((point) => point[0]))));
  const maxY = Math.min(canvasHeight, Math.ceil(Math.max(...slot.quad.map((point) => point[1]))));
  const outputWidth = maxX - minX;
  const outputHeight = maxY - minY;
  const highWidth = outputWidth * renderScale;
  const highHeight = outputHeight * renderScale;
  const output = Buffer.alloc(highWidth * highHeight * 4);
  const destinationToPlane = homography(slot.quad, [
    [0, 0],
    [planeWidth - 1, 0],
    [planeWidth - 1, planeHeight - 1],
    [0, planeHeight - 1],
  ]);
  const sample = slot.sampling === "bilinear" ? bilinearSample : bicubicSample;

  for (let y = 0; y < highHeight; y += 1) {
    for (let x = 0; x < highWidth; x += 1) {
      const canvasX = minX + (x + 0.5) / renderScale;
      const canvasY = minY + (y + 0.5) / renderScale;
      const denominator = destinationToPlane[6] * canvasX + destinationToPlane[7] * canvasY + destinationToPlane[8];
      if (Math.abs(denominator) < 1e-10) continue;
      const planeX = (destinationToPlane[0] * canvasX + destinationToPlane[1] * canvasY + destinationToPlane[2]) / denominator;
      const planeY = (destinationToPlane[3] * canvasX + destinationToPlane[4] * canvasY + destinationToPlane[5]) / denominator;
      if (!insideRoundedRect(planeX, planeY, planeWidth - 1, planeHeight - 1, slot.sourceRadius || 0)) continue;
      const outputOffset = (y * highWidth + x) * 4;
      if ((fit === "contain" || fit === "inside") &&
          (planeX < fittedX || planeY < fittedY || planeX > fittedX + fittedWidth || planeY > fittedY + fittedHeight)) {
        writeColor(output, outputOffset, background);
        continue;
      }
      let sourceX;
      let sourceY;
      sourceX = (planeX - fittedX) / fitScale - 0.5;
      sourceY = (planeY - fittedY) / fitScale - 0.5;
      sourceX = Math.max(0, Math.min(sourceWidth - 1, sourceX));
      sourceY = Math.max(0, Math.min(sourceHeight - 1, sourceY));
      sample(raw.data, sourceWidth, sourceHeight, sourceX, sourceY, output, outputOffset);
    }
  }

  let layer = sharp(output, { raw: { width: highWidth, height: highHeight, channels: 4 } })
    .resize(outputWidth, outputHeight, { kernel: sharp.kernel.lanczos3 });
  if (slot.textSensitive !== false && slot.sharpen !== false) {
    layer = layer.sharpen(slot.sharpenSigma || 0.6);
  }
  return {
    input: await layer.png().toBuffer(),
    left: minX,
    top: minY,
  };
}

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shapeSvg(shape, fill) {
  if (shape.type === "rect") {
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${shape.radius || 0}" fill="${fill}"/>`;
  }
  if (shape.type === "ellipse") {
    return `<ellipse cx="${shape.x + shape.width / 2}" cy="${shape.y + shape.height / 2}" rx="${shape.width / 2}" ry="${shape.height / 2}" fill="${fill}"/>`;
  }
  const points = shape.points.map((point) => `${point[0]},${point[1]}`).join(" ");
  return `<polygon points="${esc(points)}" fill="${fill}"/>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  for (const key of ["base", "config", "output"]) {
    if (!args[key]) throw new Error(`Missing --${key}.\n${usage()}`);
  }
  if (!fs.existsSync(args.base)) throw new Error(`Base image does not exist: ${args.base}`);
  if (!fs.existsSync(args.config)) throw new Error(`Config does not exist: ${args.config}`);

  const sharp = loadSharp();
  const config = JSON.parse(await fsp.readFile(args.config, "utf8"));
  const metadata = await sharp(args.base).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Unable to read base image dimensions.");
  validateConfig(config, metadata.width, metadata.height);

  const assetLayers = await Promise.all(config.slots.map(async (slot, index) => {
    if (slot.quad) return makePerspectiveLayer({ ...slot, index }, sharp, metadata.width, metadata.height);
    const rect = rectGeometry(slot);
    const sourceMetadata = await sharp(slot.source).metadata();
    const policy = resolveFillPolicy(slot, sourceMetadata.width, sourceMetadata.height, rect.width, rect.height, index);
    const resize = {
      fit: policy.fit,
      position: policy.position,
    };
    if (resize.fit === "contain") {
      resize.background = slot.background || { r: 255, g: 255, b: 255, alpha: 1 };
    }
    return {
      input: await sharp(slot.source)
        .resize(Math.round(rect.width), Math.round(rect.height), resize)
        .png()
        .toBuffer(),
      left: Math.round(rect.x),
      top: Math.round(rect.y),
    };
  }));

  const placed = await sharp(args.base).composite(assetLayers).png().toBuffer();
  const holes = config.slots.map((slot) => {
    if (slot.quad) return shapeSvg({ type: "polygon", points: slot.quad }, "black");
    const rect = rectGeometry(slot);
    return shapeSvg({
      type: "rect",
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      radius: slot.radius || 0,
    }, "black");
  }).join("");
  const protectedShapes = config.slots.flatMap((slot) => slot.protect || []).map((shape) => shapeSvg(shape, "white")).join("");

  const maskSvg = Buffer.from(
    `<svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><mask id="m"><rect width="100%" height="100%" fill="white"/>${holes}${protectedShapes}</mask></defs>` +
      `<rect width="100%" height="100%" fill="white" mask="url(#m)"/>` +
    `</svg>`
  );

  const overlay = await sharp(args.base)
    .ensureAlpha()
    .composite([{ input: maskSvg, left: 0, top: 0, blend: "dest-in" }])
    .png()
    .toBuffer();

  await fsp.mkdir(path.dirname(args.output), { recursive: true });
  await sharp(placed)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(args.output);

  if (args["mask-preview"]) {
    await fsp.mkdir(path.dirname(args["mask-preview"]), { recursive: true });
    await sharp(maskSvg).png().toFile(args["mask-preview"]);
  }

  if (args["qa-dir"]) {
    await fsp.mkdir(args["qa-dir"], { recursive: true });
    await Promise.all(config.slots.map(async (slot, index) => {
      const bounds = slotBounds(slot, metadata.width, metadata.height);
      const filename = `qa-${String(index + 1).padStart(2, "0")}.png`;
      await sharp(args.output)
        .extract(bounds)
        .resize(bounds.width * 2, bounds.height * 2, { kernel: sharp.kernel.nearest })
        .png({ compressionLevel: 9 })
        .toFile(path.join(args["qa-dir"], filename));
    }));
  }

  console.log(args.output);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
