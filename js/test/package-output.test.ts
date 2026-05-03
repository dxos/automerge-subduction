import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'vitest';

const distDir = path.resolve('dist');

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listFiles(fullPath);
      }
      return [fullPath];
    }),
  );

  return nested.flat();
}

describe('package output', () => {
  test('contains exactly one production wasm file', async ({ expect }) => {
    const files = await listFiles(distDir);
    const wasmFiles = files.filter((file) => file.endsWith('.wasm'));

    expect(wasmFiles.map((file) => path.relative(distDir, file))).toEqual([
      'automerge-subduction-unified.wasm',
    ]);
  });

  test('does not import upstream wasm packages directly', async ({ expect }) => {
    const files = await listFiles(distDir);
    const textFiles = files.filter((file) => /\.(?:js|cjs|d\.ts)$/.test(file));
    const contents = await Promise.all(textFiles.map((file) => readFile(file, 'utf8')));
    const combined = contents.join('\n');

    expect(combined).not.toMatch(/^\s*(?:import|export).*from ['"]@automerge\/automerge['"]/m);
    expect(combined).not.toMatch(/^\s*.*require\(['"]@automerge\/automerge['"]\)/m);
    expect(combined).not.toMatch(
      /^\s*(?:import|export).*from ['"]@automerge\/automerge-subduction['"]/m,
    );
    expect(combined).not.toMatch(/^\s*.*require\(['"]@automerge\/automerge-subduction['"]\)/m);
    expect(combined).not.toContain('automerge_wasm_bg.wasm');
    expect(combined).not.toContain('automerge_subduction_wasm_bg.wasm');
  });
});
