import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'vitest';

const distDir = path.resolve('dist');
const packageJsonPath = path.resolve('package.json');

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

  test('exposes environment-specific package entrypoints', async ({ expect }) => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    const rootExport = packageJson.exports['.'];

    expect(rootExport.node.import).toBe('./dist/esm/node.js');
    expect(rootExport.browser.import).toBe('./dist/esm/bundler.js');
    expect(rootExport.workerd.import).toBe('./dist/esm/workerd.js');
    expect(rootExport.worker.import).toBe('./dist/esm/workerd.js');
    expect(rootExport.import).toBe('./dist/esm/web.js');
    expect(packageJson.exports['./slim'].import).toBe('./dist/esm/slim.js');
    expect(packageJson.exports['./wasm']).toBe('./dist/automerge-subduction-unified.wasm');
    expect(packageJson.exports['./wasm-base64'].import).toBe('./dist/esm/wasm-base64.js');
  });

  test('keeps web, worker, bundler, and slim entrypoints free of Node-only imports', async ({
    expect,
  }) => {
    const entrypoints = [
      'dist/esm/web.js',
      'dist/esm/workerd.js',
      'dist/esm/bundler.js',
      'dist/esm/slim.js',
      'dist/esm/bindgen.js',
    ];
    const contents = await Promise.all(
      entrypoints.map((entrypoint) => readFile(path.resolve(entrypoint), 'utf8')),
    );
    const combined = contents.join('\n');

    expect(combined).not.toContain("from 'node:");
    expect(combined).not.toContain('require(');
    expect(combined).not.toContain('readFileSync');
    expect(combined).not.toContain('__dirname');
  });
});
