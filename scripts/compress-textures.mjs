// Pakib client/public/textures/ JPG-d webp-ks (TextureLoader loeb webp-d natiivselt).
// Vajab sharp'i: käivita nt `NODE_PATH=<sharp'iga node_modules> node scripts/compress-textures.mjs`
// või `npm i sharp && node scripts/compress-textures.mjs` repo juurest.
import { readdir, stat, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "client", "public", "textures");

// Kvaliteet kaardi tüübi järgi: normal on tundlikum, ao/rough on ühekanalilised
const quality = (name) =>
  name.includes("_normal") ? 90 : name.includes("_color") || name.includes("waternormals") ? 80 : 75;

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let before = 0, after = 0;
for await (const file of walk(root)) {
  if (!file.endsWith(".jpg")) continue;
  const out = file.replace(/\.jpg$/, ".webp");
  const q = quality(file);
  await sharp(file).webp({ quality: q }).toFile(out);
  const [a, b] = [await stat(file), await stat(out)];
  before += a.size; after += b.size;
  await unlink(file);
  console.log(`${file.split("/textures/")[1]}  ${(a.size / 1e6).toFixed(1)}MB -> ${(b.size / 1e6).toFixed(1)}MB (q${q})`);
}
console.log(`\nKokku: ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(1)}MB`);
