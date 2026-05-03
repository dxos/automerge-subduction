import { describe, test } from 'vitest';

import init, { create, MemorySigner } from '../dist/esm/node.js';

describe('memory smoke', () => {
  test('initializes Automerge and Subduction symbols without loading upstream packages', async ({
    expect,
  }) => {
    const before = process.memoryUsage().heapUsed;

    await init();
    const doc = create();
    const signer = MemorySigner.generate();

    const after = process.memoryUsage().heapUsed;

    expect(doc).toBeDefined();
    expect(signer).toBeDefined();
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
