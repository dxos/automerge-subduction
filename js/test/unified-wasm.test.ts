import { describe, test } from 'vitest';

import init, {
  create,
  load,
  MemorySigner,
  MemoryStorage,
  SedimentreeAutomerge,
  SedimentreeId,
  Subduction,
  wasmReleaseInfo,
} from '../dist/esm/node.js';

describe('unified wasm package', () => {
  test('uses one initialized module for Automerge and Subduction APIs', async ({ expect }) => {
    await init();

    const doc = create();
    doc.put('title', 'unified');
    const saved = doc.save();
    const loaded = load(saved);

    expect(loaded.get('title')).toBe('unified');
    expect(loaded.save()).toBeInstanceOf(Uint8Array);

    loaded.put('count', 1);
    const patch = loaded.saveIncremental();
    const patched = load(saved);
    patched.loadIncremental(patch);
    expect(patched.get('count')).toBe(1);

    const signer = MemorySigner.generate();
    const storage = new MemoryStorage();
    const syncer = new Subduction(signer, storage);
    const sedimentreeId = SedimentreeId.fromBytes(new Uint8Array(32));
    const sedimentreeAutomerge = new SedimentreeAutomerge(loaded);

    expect(syncer).toBeDefined();
    expect(sedimentreeId.toBytes()).toHaveLength(32);
    expect(sedimentreeAutomerge).toBeDefined();
    expect(wasmReleaseInfo().name).toBe('automerge_subduction_unified_wasm');
  });
});
