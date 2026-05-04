import fs from 'node:fs';
import { createRequire } from 'node:module';

import { afterEach, describe, test, vi } from 'vitest';

const require = createRequire(import.meta.url);
let importCounter = 0;

async function importFreshNodeDist() {
  delete require.cache[require.resolve('../dist/cjs/node.cjs')];
  return import(/* @vite-ignore */ `../dist/esm/node.js?fresh=${importCounter++}`);
}

describe('wasm reinitialization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('exports reinit helpers from generated and public ESM entrypoints', async ({ expect }) => {
    const modules = await Promise.all([
      import('../dist/esm/bindgen.js'),
      import('../dist/esm/web.js'),
      import('../dist/esm/bundler.js'),
      import('../dist/esm/workerd.js'),
      import('../dist/esm/slim.js'),
    ]);

    for (const mod of modules) {
      expect(mod.isWasmLoaded).toBeTypeOf('function');
      expect(mod.reinitWasmSync).toBeTypeOf('function');
    }
  });

  test('reports load state and throws before initialization', async ({ expect }) => {
    const mod = await importFreshNodeDist();

    expect(mod.isWasmLoaded()).toBe(false);
    expect(() => mod.reinitWasmSync()).toThrow(
      new Error('reinitWasm called before wasm was initialized.'),
    );
  });

  test('reinitializes from the cached unified wasm module', async ({ expect }) => {
    const readFileSync = vi.spyOn(fs, 'readFileSync');
    const mod = await importFreshNodeDist();
    const wasmReadCount = () =>
      readFileSync.mock.calls.filter(([file]) =>
        String(file).endsWith('automerge-subduction-unified.wasm'),
      ).length;

    expect(mod.isWasmLoaded()).toBe(false);

    await mod.default();
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
