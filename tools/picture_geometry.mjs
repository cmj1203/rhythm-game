// Fills each picture in public/pictures and records which half-unit cells of its 100x100 box it covers, for
// tools/picture_road.ts to trace the silhouette from. One file per picture goes to <dir>, so a run can be resumed.
//   bun tools/picture_geometry.mjs <dir> [--pages 8]
//   then: bun tools/picture_geometry.mjs <dir> --join <file>
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";

const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: { pages: { type: "string", default: "8" }, join: { type: "string" } },
});
const dir = positionals[0];
if (dir === undefined) throw new TypeError("usage: picture_geometry.mjs <dir> [--pages n] [--join file]");
await mkdir(dir, { recursive: true });
const root = new URL("../public/pictures/", import.meta.url);
/** How bold the lines are drawn (in the pictures' 100-unit box) when finding the shape they enclose. */
const LINE_WIDTH = 1.5;

if (args.join !== undefined) {
  const files = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  const pictures = await Promise.all(files.map(async (name) => JSON.parse(await readFile(`${dir}/${name}`, "utf8"))));
  await writeFile(args.join, JSON.stringify({ pictures }));
  console.log(`JOINED ${pictures.length} -> ${args.join}`);
  process.exit(0);
}

const done = new Set((await readdir(dir)).map((name) => name.replace(/\.json$/, "")));
const ids = (await readdir(root)).filter((name) => name.endsWith(".svg")).map((name) => name.slice(0, -4)).sort()
  .filter((id) => !done.has(id));
const require = createRequire(`${process.env.HOME}/mobile-test/package.json`);
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
let next = 0;
try {
  await Promise.all(Array.from({ length: Number(args.pages) }, async () => {
    const page = await browser.newPage();
    while (next < ids.length) {
      const id = ids[next++];
      const svg = await readFile(new URL(`${id}.svg`, root), "utf8");
      // Lines are drawn bold, then everything the outside can reach without crossing one is outside; the rest is
      // the picture's shape, even for a one-line drawing whose ends do not meet.
      const bold = svg.replace(/stroke-width="[^"]*"/g, `stroke-width="${LINE_WIDTH}"`);
      const { mask, ink } = await page.evaluate(async ({ source, bold, step }) => {
        const doc = new DOMParser().parseFromString(source, "image/svg+xml");
        if (doc.querySelector("parsererror")) throw new Error("SVG parse failed");
        // The total length of the picture's lines, to tell a clean outline from one scribbled inside.
        const bench = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        document.body.append(bench);
        let ink = 0;
        for (const shape of doc.querySelectorAll("path, line, polyline, polygon, circle, ellipse, rect")) {
          const copy = shape.cloneNode();
          bench.append(copy);
          ink += copy.getTotalLength();
        }
        bench.remove();
        const size = Math.round(100 / step);
        const image = new Image();
        image.src = URL.createObjectURL(new Blob([bold], { type: "image/svg+xml" }));
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, size, size);
        const alpha = ctx.getImageData(0, 0, size, size).data;
        const n = size + 2;
        const line = new Uint8Array(n * n);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) line[(y + 1) * n + x + 1] = alpha[(y * size + x) * 4 + 3] > 0 ? 1 : 0;
        const outside = new Uint8Array(n * n);
        const stack = [0];
        outside[0] = 1;
        while (stack.length > 0) {
          const i = stack.pop();
          const x = i % n, y = (i - x) / n;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy, j = ny * n + nx;
            if (nx >= 0 && ny >= 0 && nx < n && ny < n && line[j] === 0 && outside[j] === 0) { outside[j] = 1; stack.push(j); }
          }
        }
        const cells = [];
        for (let y = 1; y <= size; y++) for (let x = 1; x <= size; x++) {
          if (outside[y * n + x] === 0) cells.push({ x: (x - 0.5) * step, y: (y - 0.5) * step });
        }
        return { mask: { step, cells, area: cells.length * step * step }, ink };
      }, { source: svg, bold, step: 0.5 });
      await writeFile(`${dir}/${id}.json`, JSON.stringify({ id, strokes: [], mask, ink }));
      console.log(`GEOMETRY ${id} cells=${mask.cells.length}`);
    }
  }));
} finally {
  await browser.close();
}
