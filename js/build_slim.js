import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const slimPackageDir = path.join(__dirname, 'pkg-slim');

execSync(
  'wasm-pack build ../crates/automerge_subduction_unified_wasm --out-dir ../../js/pkg-slim --target web --release',
  { stdio: 'inherit' },
);

copyFileSync(path.join(__dirname, 'slim-shim.ts'), path.join(slimPackageDir, 'index.ts'));

execSync(
  'pnpm exec tsc pkg-slim/index.ts --outDir pkg-slim --target esnext --module esnext --declaration --moduleResolution bundler',
  { stdio: 'inherit' },
);

const wasmFile = path.join(slimPackageDir, 'automerge_subduction_unified_wasm_bg.wasm');
const wasmBase64 = Buffer.from(readFileSync(wasmFile)).toString('base64').trim();

writeFileSync(
  path.join(slimPackageDir, 'automerge_subduction_unified_wasm_bg.wasm.base64.js'),
  `export const wasmBase64 = ${JSON.stringify(wasmBase64)};\n`,
);

writeFileSync(
  path.join(slimPackageDir, 'automerge_subduction_unified_wasm_bg.wasm.base64.d.ts'),
  'export declare const wasmBase64: string;\n',
);
