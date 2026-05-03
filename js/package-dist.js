import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const esmDir = path.join(distDir, 'esm');
const cjsDir = path.join(distDir, 'cjs');
const wasmName = 'automerge-subduction-unified.wasm';
const bindgenBase = 'automerge_subduction_unified_wasm';
const bindgenWasm = `${bindgenBase}_bg.wasm`;

async function copyText(from, to, transform = (value) => value) {
  const text = await readFile(from, 'utf8');
  await writeFile(to, transform(text));
}

async function copyBinary(from, to) {
  await writeFile(to, await readFile(from));
}

async function copyCjsSnippets(from, to) {
  await mkdir(to, { recursive: true });
  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyCjsSnippets(source, target);
    } else {
      const text = await readFile(source, 'utf8');
      await writeFile(
        target,
        text.replace(/export function ([A-Za-z0-9_$]+)\s*\(/g, 'exports.$1 = function $1('),
      );
    }
  }
}

function patchEsmWasmImport(text) {
  return text.replaceAll(`./${bindgenWasm}`, `../${wasmName}`);
}

function patchCjsWasmPath(text) {
  return text.replaceAll(bindgenWasm, `../${wasmName}`);
}

function exportedNames(bindgenText) {
  const match = bindgenText.match(/export\s+\{([\s\S]*?)\}\s+from\s+["']\.\/automerge_subduction_unified_wasm_bg\.js["']/);
  if (!match) {
    throw new Error('could not find wasm-bindgen export list');
  }
  return match[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function nodeEsmEntrypoint(names) {
  const exports = names.map((name) => `export const ${name} = mod.${name};`).join('\n');
  return `import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mod = require('../cjs/node.cjs');

export default async function init() {
  return mod;
}

${exports}
`;
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(esmDir, { recursive: true });
  await mkdir(cjsDir, { recursive: true });

  await copyBinary(path.join('pkg', bindgenWasm), path.join(distDir, wasmName));
  const bindgenText = await readFile(path.join('pkg', `${bindgenBase}.js`), 'utf8');
  const names = exportedNames(bindgenText);
  await writeFile(path.join(esmDir, 'bindgen.js'), patchEsmWasmImport(bindgenText));
  await copyText(
    path.join('pkg', `${bindgenBase}_bg.js`),
    path.join(esmDir, `${bindgenBase}_bg.js`),
  );
  await cp(path.join('pkg', 'snippets'), path.join(esmDir, 'snippets'), {
    recursive: true,
  });
  await copyText(path.join('pkg', `${bindgenBase}.d.ts`), path.join(distDir, 'index.d.ts'));
  await copyText(
    path.join('pkg-node', `${bindgenBase}.js`),
    path.join(cjsDir, 'node.cjs'),
    patchCjsWasmPath,
  );
  await writeFile(path.join(cjsDir, 'package.json'), '{"type":"commonjs"}\n');
  await copyCjsSnippets(path.join('pkg', 'snippets'), path.join(cjsDir, 'snippets'));

  const esmEntrypoint = "export { default } from './bindgen.js';\nexport * from './bindgen.js';\n";
  await writeFile(path.join(esmDir, 'bundler.js'), esmEntrypoint);
  await writeFile(path.join(esmDir, 'node.js'), nodeEsmEntrypoint(names));
  await writeFile(path.join(esmDir, 'web.js'), esmEntrypoint);
  await writeFile(path.join(esmDir, 'workerd.js'), esmEntrypoint);

  const nodeCjs = "module.exports = require('./node.cjs');\n";
  await writeFile(path.join(cjsDir, 'web.cjs'), nodeCjs);

  const slimJs = await readFile(path.join('pkg-slim', 'index.js'), 'utf8');
  await writeFile(
    path.join(esmDir, 'slim.js'),
    slimJs.replaceAll(`./${bindgenBase}.js`, './bindgen.js'),
  );
  await writeFile(path.join(cjsDir, 'slim.cjs'), nodeCjs);

  const wasmBase64 = Buffer.from(await readFile(path.join(distDir, wasmName))).toString('base64');
  await writeFile(path.join(esmDir, 'wasm-base64.js'), `export const wasmBase64 = ${JSON.stringify(wasmBase64)};\n`);
  await writeFile(path.join(cjsDir, 'wasm-base64.cjs'), `exports.wasmBase64 = ${JSON.stringify(wasmBase64)};\n`);

  const wasmFiles = (await readdir(distDir, { recursive: true })).filter((file) =>
    String(file).endsWith('.wasm'),
  );
  if (wasmFiles.length !== 1) {
    throw new Error(`expected exactly one production wasm in dist, found ${wasmFiles.length}: ${wasmFiles.join(', ')}`);
  }
}

await main();
