import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const packageJsonPath = path.resolve('package.json');
const bindgenBase = 'automerge_subduction_unified_wasm';

const variants = [
  {
    prefix: '',
    dirSuffix: '',
  },
  {
    prefix: 'debug-',
    dirSuffix: '-debug',
  },
];

function distPath(...parts) {
  return path.join(distDir, ...parts);
}

function wasmBindgenPath(variant, target, file = `${bindgenBase}.js`) {
  return distPath('wasm_bindgen', `${target}${variant.dirSuffix}`, file);
}

async function rewriteTextFile(file, transform) {
  await writeFile(file, transform(await readFile(file, 'utf8')));
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function replaceOnce(text, search, replacement, description) {
  if (!text.includes(search)) {
    throw new Error(`could not patch wasm-bindgen output: ${description}`);
  }
  return text.replace(search, replacement);
}

function replaceAllRequired(text, search, replacement, description) {
  if (!text.includes(search)) {
    throw new Error(`could not patch wasm-bindgen output: ${description}`);
  }
  return text.replaceAll(search, replacement);
}

function patchWebBindgen(text) {
  if (text.includes('function isWasmLoaded()')) {
    return text;
  }

  let patched = text;
  if (!patched.includes('let wasmModule, wasm;')) {
    patched = replaceOnce(
      patched,
      'let wasm;',
      'let wasmModule, wasm;',
      'web wasm module cache declaration',
    );
  }
  if (!patched.includes('    wasmModule = module;\n')) {
    patched = replaceOnce(
      patched,
      '    wasm = instance.exports;\n',
      '    wasm = instance.exports;\n    wasmModule = module;\n',
      'web wasm module cache assignment',
    );
  }

  const initGuard = '    if (wasm !== undefined) return wasm;\n\n\n';
  patched = replaceOnce(patched, initGuard, '', 'initSync existing-instance guard');
  patched = replaceOnce(patched, initGuard, '', 'async init existing-instance guard');

  patched = replaceOnce(
    patched,
    `async function __wbg_init(module_or_path) {`,
    `function isWasmLoaded() {
    return wasm !== undefined;
}

function reinitWasmSync() {
    if (wasmModule == null) {
        if (wasm !== undefined && typeof wasm.__wbindgen_start === 'function') {
            wasm.__wbindgen_start();
            return;
        }
        throw new Error('reinitWasm called before wasm was initialized.');
    }
    initSync({ module: wasmModule });
}

async function __wbg_init(module_or_path) {`,
    'web reinit helpers',
  );

  return replaceOnce(
    patched,
    'export { initSync, __wbg_init as default };',
    'export { initSync, isWasmLoaded, reinitWasmSync, __wbg_init as default };',
    'web export list',
  );
}

function patchCjsBindings(text) {
  if (text.includes('function isWasmLoaded()')) {
    return text;
  }

  let patched = replaceOnce(
    text,
    '  initSync: () => initSync,\n',
    '  initSync: () => initSync,\n  isWasmLoaded: () => isWasmLoaded,\n',
    'cjs export getter for isWasmLoaded',
  );
  patched = replaceOnce(
    patched,
    '  readBundle: () => readBundle,\n',
    '  readBundle: () => readBundle,\n  reinitWasmSync: () => reinitWasmSync,\n',
    'cjs export getter for reinitWasmSync',
  );

  const initGuard = '  if (wasm !== void 0) return wasm;\n';
  patched = replaceAllRequired(patched, initGuard, '', 'cjs existing-instance guards');

  patched = replaceOnce(
    patched,
    'function __wbg_set_wasm(val) {',
    `function isWasmLoaded() {
  return wasm !== void 0;
}
function reinitWasmSync() {
  if (wasmModule == null) {
    if (wasm !== void 0 && typeof wasm.__wbindgen_start === "function") {
      wasm.__wbindgen_start();
      return;
    }
    throw new Error("reinitWasm called before wasm was initialized.");
  }
  initSync({ module: wasmModule });
}
function __wbg_set_wasm(val) {
`,
    'cjs reinit helpers',
  );

  if (patched.includes('  initSync,\n') && !patched.includes('  isWasmLoaded,\n')) {
    patched = replaceOnce(
      patched,
      '  initSync,\n',
      '  initSync,\n  isWasmLoaded,\n',
      'cjs ESM annotation for isWasmLoaded',
    );
  }
  if (patched.includes('  readBundle,\n') && !patched.includes('  reinitWasmSync,\n')) {
    patched = replaceOnce(
      patched,
      '  readBundle,\n',
      '  readBundle,\n  reinitWasmSync,\n',
      'cjs ESM annotation for reinitWasmSync',
    );
  }

  return patched;
}

function patchTypes(text) {
  if (text.includes('export function isWasmLoaded(): boolean;')) {
    return text;
  }
  return `${text}
/**
 * Loaded wasm module.
 * @returns true if the wasm module has been loaded.
 */
export function isWasmLoaded(): boolean;

/**
 * Re-initialize the wasm module.
 */
export function reinitWasmSync(): void;
`;
}

function patchInitializedEntrypoint(text) {
  if (text.includes('export default async function init()')) {
    return text;
  }

  const target = `'../wasm_bindgen/web${text.includes('/web-debug/') ? '-debug' : ''}/${bindgenBase}.js'`;
  const exportLine = `export * from ${target};\n`;
  if (!text.includes(exportLine)) {
    throw new Error('could not patch wasm-bodge entrypoint default export');
  }

  return `${text.replace(exportLine, `import * as bindings from ${target};\n${exportLine}`)}
export default async function init() {
  return bindings;
}
`;
}

async function assertNoSplitPackageReferences() {
  const files = (await readdir(distDir, { recursive: true }))
    .map(String)
    .filter((file) => /\.(?:js|cjs|d\.ts)$/.test(file));
  const forbidden = ['automerge_wasm_bg.wasm', 'automerge_subduction_wasm_bg.wasm'];

  for (const file of files) {
    const text = await readFile(path.join(distDir, file), 'utf8');
    const match = forbidden.find((reference) => text.includes(reference));
    if (match) {
      throw new Error(`stale split wasm-bindgen reference in dist/${file}: ${match}`);
    }
  }
}

async function patchInitializedEntrypoints(variant) {
  for (const env of ['node', 'web', 'bundler', 'workerd']) {
    await rewriteTextFile(distPath('esm', `${variant.prefix}${env}.js`), patchInitializedEntrypoint);
  }
}

async function patchCjsEntrypoints(variant) {
  for (const file of [`${variant.prefix}web-bindings.cjs`, `${variant.prefix}web.cjs`]) {
    await rewriteTextFile(distPath('cjs', file), patchCjsBindings);
  }
}

function addWorkerCondition(rootExport) {
  const { types, workerd, node, browser } = rootExport;
  return {
    types,
    workerd,
    worker: workerd,
    node,
    browser,
    import: rootExport.import,
    require: rootExport.require,
  };
}

async function patchPackageJson() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

  packageJson.exports['.'] = addWorkerCondition(packageJson.exports['.']);
  packageJson.exports['./debug'] = addWorkerCondition(packageJson.exports['./debug']);

  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function assertBodgeOutput() {
  for (const file of [
    distPath('index.d.ts'),
    distPath('esm', 'wasm-base64.js'),
    distPath('esm', 'debug-wasm-base64.js'),
    distPath('cjs', 'wasm-base64.cjs'),
    distPath('cjs', 'debug-wasm-base64.cjs'),
    distPath('automerge-subduction-unified.wasm'),
    distPath('automerge-subduction-unified-debug.wasm'),
    wasmBindgenPath(variants[0], 'nodejs', `${bindgenBase}.cjs`),
    wasmBindgenPath(variants[0], 'bundler', `${bindgenBase}_bg.wasm`),
    wasmBindgenPath(variants[0], 'web', `${bindgenBase}_bg.wasm`),
    wasmBindgenPath(variants[1], 'bundler', `${bindgenBase}_bg.wasm`),
    wasmBindgenPath(variants[1], 'web', `${bindgenBase}_bg.wasm`),
  ]) {
    if (!(await fileExists(file))) {
      throw new Error(`expected wasm-bodge output file missing: ${path.relative(distDir, file)}`);
    }
  }
}

async function main() {
  await patchPackageJson();

  for (const variant of variants) {
    await rewriteTextFile(wasmBindgenPath(variant, 'web'), patchWebBindgen);
    await patchInitializedEntrypoints(variant);
    await patchCjsEntrypoints(variant);
  }

  await rewriteTextFile(distPath('index.d.ts'), patchTypes);
  await patchPackageJson();
  await assertBodgeOutput();
  await assertNoSplitPackageReferences();
}

await main();
