// Builds the extension into build/ (the folder you load in the browser).
//   node build.mjs           one-off build
//   node build.mjs --watch   rebuild on every save
//   node build.mjs --test    build-test/ with extra permissions so automated tests can drive it
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const test = process.argv.includes('--test');
const out = path.join(here, test ? 'build-test' : 'build');

async function copyStatic() {
  await fs.mkdir(path.join(out, 'icons'), { recursive: true });
  const manifest = JSON.parse(await fs.readFile(path.join(here, 'static/manifest.json'), 'utf8'));
  if (test) {
    manifest.host_permissions = ['<all_urls>'];
    manifest.name += ' (test build)';
  }
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const f of await fs.readdir(path.join(here, 'static/icons'))) {
    if (f.endsWith('.png')) await fs.copyFile(path.join(here, 'static/icons', f), path.join(out, 'icons', f));
  }
}

// A fingerprint of the source, so a page that still runs an older copy knows to replace it.
async function sourceHash() {
  const dir = path.join(here, 'src/content');
  const h = crypto.createHash('sha1');
  for (const f of (await fs.readdir(dir)).sort()) h.update(f).update(await fs.readFile(path.join(dir, f)));
  return h.digest('hex').slice(0, 12);
}

const options = {
  define: { __PD_BUILD__: JSON.stringify(await sourceHash()) },
  entryPoints: { content: path.join(here, 'src/content/index.js'), background: path.join(here, 'src/background.js') },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: ['chrome116'],
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'info',
  plugins: [
    {
      name: 'static',
      setup(b) {
        b.onEnd(async (r) => {
          if (!r.errors.length) await copyStatic();
        });
      },
    },
  ],
};

await fs.rm(out, { recursive: true, force: true });
if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  await esbuild.build(options);
}
