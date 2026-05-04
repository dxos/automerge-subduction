import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { afterEach, describe, test, vi } from 'vitest';

const require = createRequire(import.meta.url);
let importCounter = 0;

function requireFreshCjs(specifier: string) {
  delete require.cache[require.resolve(specifier)];
  return require(specifier);
}

function requireFreshNodeDist() {
  delete require.cache[require.resolve('../dist/cjs/node.cjs')];
  delete require.cache[require.resolve('../dist/cjs/web-bindings.cjs')];
  return require('../dist/cjs/node.cjs');
}

async function importDist(specifier: string) {
  return import(/* @vite-ignore */ specifier);
}

describe('wasm reinitialization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('exports reinit helpers from generated and public ESM entrypoints', async ({ expect }) => {
    const modules = await Promise.all([
      importDist('../dist/wasm_bindgen/web/automerge_subduction_unified_wasm.js'),
      importDist(`../dist/esm/node.js?fresh=${importCounter++}`),
      importDist('../dist/esm/web.js'),
      importDist('../dist/esm/slim.js'),
    ]);
    const workerdEntrypoint = await readFile('dist/esm/workerd.js', 'utf8');

    for (const mod of modules) {
      expect(mod.isWasmLoaded).toBeTypeOf('function');
      expect(mod.reinitWasmSync).toBeTypeOf('function');
    }
    expect(workerdEntrypoint).toContain(
      "export * from '../wasm_bindgen/web/automerge_subduction_unified_wasm.js'",
    );
  });

  test('reports load state and throws before manual slim initialization', async ({ expect }) => {
    delete require.cache[require.resolve('../dist/cjs/debug-web-bindings.cjs')];
    const mod = requireFreshCjs('../dist/cjs/debug-slim.cjs');

    expect(mod.isWasmLoaded()).toBe(false);
    expect(() => mod.reinitWasmSync()).toThrow(
      new Error('reinitWasm called before wasm was initialized.'),
    );
  });

  test('reinitializes from the cached unified wasm module', async ({ expect }) => {
    const readFileSync = vi.spyOn(fs, 'readFileSync');
    const mod = requireFreshNodeDist();
    const wasmReadCount = () =>
      readFileSync.mock.calls.filter(([file]) =>
        String(file).endsWith('automerge_subduction_unified_wasm_bg.wasm'),
      ).length;

    expect(mod.isWasmLoaded()).toBe(true);
    expect(wasmReadCount()).toBe(1);

    mod.reinitWasmSync();
    expect(mod.isWasmLoaded()).toBe(true);
    expect(wasmReadCount()).toBe(1);

    const doc = mod.create();
    doc.put('title', 'after-reinit');
    expect(mod.load(doc.save()).get('title')).toBe('after-reinit');

    const signer = mod.MemorySigner.generate();
    const storage = new mod.MemoryStorage();
    const syncer = new mod.Subduction(signer, storage);

    expect(syncer).toBeDefined();
  });
});
