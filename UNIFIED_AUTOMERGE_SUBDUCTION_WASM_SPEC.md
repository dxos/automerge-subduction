# Unified Automerge + Subduction WASM Package Spec

## Summary

Build a separate repository that produces one Rust `cdylib` and one JavaScript package containing a single
production `.wasm` file. The package must expose both Automerge document bindings and Subduction/Sedimentree
replication bindings from the same WebAssembly module.

The primary motivation is Cloudflare Workers memory pressure: avoid loading `@automerge/automerge` WASM and
`@automerge/automerge-subduction` WASM as separate modules with separate linear memories in the same isolate.

## Repository Description

Unified Rust/WASM bindings for Automerge documents and Subduction replication, published as a single JavaScript
package with one shared WebAssembly module for memory-constrained runtimes like Cloudflare Workers.

## Goals

- Emit exactly one production WASM binary for both Automerge and Subduction APIs.
- Share one Rust dependency graph, one wasm-bindgen module, one allocator, and one WASM linear memory.
- Preserve enough Automerge low-level API compatibility for DXOS Edge to use a thin compatibility wrapper.
- Preserve Subduction's API style, package shape, and build tooling as the primary design influence.
- Support Node, bundler/browser, slim/base64, and `workerd` package entrypoints.
- Include a JavaScript test suite that imports the built JS package and exercises the produced WASM module.

## Non-Goals

- Do not reimplement Automerge or Subduction.
- Do not make the package a complete drop-in replacement for every upstream JS API on day one.
- Do not include debug WASM in production exports.
- Do not solve all Automerge OOM cases. A unified WASM can reduce duplicated baseline memory, but the linear memory
  still grows to its high-water mark.

## Tooling Choice

Use Subduction's tooling as the base:

- Rust bindings via `wasm-bindgen`.
- JS package builds via `wasm-pack build`.
- Release builds optimized through `wasm-opt -Oz`.
- Package exports modeled after `@automerge/subduction` and `@automerge/automerge-subduction`.

Borrow from Automerge only where needed:

- Automerge low-level binding surface and TypeScript custom sections.
- Workerd export compatibility.
- Base64/slim initialization ideas.
- Vite asset-scanner fixups only if generated wasm-bindgen output causes duplicate WASM inclusion.

Do not use Automerge's custom `cargo build` plus manual `wasm-bindgen` pipeline as the primary build path unless
`wasm-pack` cannot reproduce required outputs.

## Repository Layout

```text
automerge-subduction-unified/
  Cargo.toml
  package.json
  pnpm-lock.yaml
  README.md
  LICENSE-MIT
  LICENSE-APACHE

  crates/
    automerge_subduction_unified_wasm/
      Cargo.toml
      build.rs
      src/
        lib.rs
        automerge_api.rs
        subduction_api.rs
        sedimentree_api.rs
        interop/
        error.rs

  js/
    package.json
    build_slim.js
    slim-shim.ts
    vite.config.ts
    src/
      index.ts
      node.ts
      web.ts
      workerd.ts
      bundler.ts
      slim.ts
    test/
      unified-wasm.test.ts
      package-output.test.ts
```

The single Rust crate under `crates/automerge_subduction_unified_wasm` owns the final `cdylib`. It may depend on
upstream Automerge and Subduction crates, but no other crate in this repo should produce a WASM binary for the
published JS package.

## Rust Crate

The Rust crate should be structured as the only final WASM artifact:

```toml
[package]
name = "automerge_subduction_unified_wasm"
description = "Unified WASM bindings for Automerge documents and Subduction replication"
edition = "2021"
license = "MIT OR Apache-2.0"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]
```

Dependencies should be path or git pinned initially, then moved to published versions once upstream compatibility is
stable:

```toml
[dependencies]
automerge = { version = "...", features = ["wasm", "utf16-indexing"] }

subduction_wasm = { version = "...", default-features = false }
automerge_sedimentree_wasm = { version = "...", default-features = false }
sedimentree_wasm = { version = "...", default-features = false }

wasm-bindgen = { version = "...", features = ["serde-serialize", "std"] }
wasm-bindgen-futures = "..."
js-sys = "..."
web-sys = { version = "...", default-features = false, features = [...] }
console_error_panic_hook = { version = "...", optional = true }
tracing = { version = "...", optional = true }
wasm_refgen = "..."
```

Feature rules:

```toml
[features]
default = ["console_error_panic_hook", "std", "wasm-tracing"]

# This crate is the only cdylib, so it may own the wasm-bindgen start hook.
standalone = []

std = [
  "subduction_wasm/std",
  "automerge_sedimentree_wasm/std",
  "sedimentree_wasm/std",
  "wasm-bindgen/std",
]

idb = [
  "subduction_wasm/idb",
  "sedimentree_wasm/idb",
]

wasm-tracing = ["tracing"]
```

When depending on Subduction's WASM crates, disable their `standalone` feature if possible. `wasm-bindgen` allows only
one `#[wasm_bindgen(start)]` entry point per final module.

Release optimization should follow Subduction:

```toml
[package.metadata.wasm-pack.profile.release]
wasm-opt = [
  "-Oz",
  "--enable-bulk-memory",
  "--enable-multivalue",
  "--enable-mutable-globals",
  "--enable-nontrapping-float-to-int",
  "--enable-reference-types",
  "--enable-sign-ext",
  "--enable-simd"
]
```

## Rust API Surface

Expose two conceptual API groups, even if wasm-bindgen exports are flat.

Automerge-side exports should be compatible with the low-level API used by `@automerge/automerge`:

- `Automerge`.
- `create`.
- `load`.
- `encodeChange`.
- `decodeChange`.
- `initSyncState`.
- `encodeSyncMessage`.
- `decodeSyncMessage`.
- `encodeSyncState`.
- `decodeSyncState`.
- `importSyncState`.
- `exportSyncState`.
- `readBundle`.
- `wasmReleaseInfo`.

Subduction-side exports should preserve Subduction naming and semantics:

- `Subduction`.
- `MemorySigner`.
- `PeerId`.
- `SedimentreeId`.
- `CommitId`.
- `Digest`.
- `Transport`.
- `AuthenticatedTransport`.
- `SubductionWebSocket`.
- `SubductionLongPoll`.
- `Sedimentree`.
- `SedimentreeAutomerge`.
- Storage-related signed commit and fragment classes.

Primary requirement: all exports above must come from one generated `*_bg.wasm` file.

## JavaScript Package

Suggested package name:

```json
{
  "name": "@dxos/automerge-subduction-unified",
  "type": "module",
  "main": "./dist/cjs/node.cjs",
  "module": "./dist/esm/bundler.js",
  "types": "./dist/index.d.ts"
}
```

Exports should mirror Subduction's package shape:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "workerd": {
        "import": "./dist/esm/workerd.js",
        "require": "./dist/cjs/web.cjs"
      },
      "node": {
        "import": "./dist/esm/node.js",
        "require": "./dist/cjs/node.cjs"
      },
      "browser": {
        "import": "./dist/esm/bundler.js",
        "require": "./dist/cjs/web.cjs"
      },
      "import": "./dist/esm/web.js",
      "require": "./dist/cjs/web.cjs"
    },
    "./slim": {
      "types": "./dist/index.d.ts",
      "import": "./dist/esm/slim.js",
      "require": "./dist/cjs/slim.cjs"
    },
    "./wasm": "./dist/automerge-subduction-unified.wasm",
    "./wasm-base64": {
      "import": "./dist/esm/wasm-base64.js",
      "require": "./dist/cjs/wasm-base64.cjs"
    }
  }
}
```

Build scripts should prioritize `wasm-pack`:

```json
{
  "scripts": {
    "build": "pnpm run build-node && pnpm run build-bundler && pnpm run build-slim && pnpm run package-dist",
    "build-node": "wasm-pack build crates/automerge_subduction_unified_wasm --out-dir ../../../js/pkg-node --target nodejs --release",
    "build-bundler": "wasm-pack build crates/automerge_subduction_unified_wasm --out-dir ../../../js/pkg --target bundler --release",
    "build-slim": "node js/build_slim.js",
    "test": "vitest --run --passWithNoTests",
    "test:watch": "vitest"
  }
}
```

`build_slim.js` should follow Subduction's pattern:

- Run `wasm-pack build --target web --release`.
- Copy `slim-shim.ts`.
- Compile the shim with `tsc`.
- Base64 encode the generated `.wasm`.
- Export `initFromBase64(base64: string)`.

## Initialization Contract

Expose explicit init paths:

```ts
import init, {
  Automerge,
  Subduction,
  MemorySigner,
} from '@dxos/automerge-subduction-unified';

await init();
```

For Workers and other environments where WASM imports are difficult, support base64 or explicit bytes:

```ts
import { initFromBase64 } from '@dxos/automerge-subduction-unified/slim';
import { wasmBase64 } from '@dxos/automerge-subduction-unified/wasm-base64';

await initFromBase64(wasmBase64);
```

Calling init once must initialize both Automerge and Subduction bindings because they share the same module instance
and linear memory.

## JS/WASM Vitest Test Suite

The repo must include a JavaScript test suite that imports and uses the produced JS package exactly as downstream
consumers will use it. Tests must verify that both Automerge and Subduction bindings are served by the same generated
WASM module.

Use the same Vitest style as the DXOS Edge repo:

- Test runner: `vitest`.
- General Node test setup only.
- Shared config helper may mirror the Node branch of this repo's `vitest.shared.ts`.
- `vite.config.ts` should export `await createConfig(...)` or a direct `defineConfig(...)`.
- Node tests match `./{src,test}/**/*.test.ts`.
- Test command: `vitest --run --passWithNoTests`.
- Use `describe` and `test`, not `it`.
- Prefer `test('description', ({ expect }) => { ... })` for local assertions.

The new repo does not need to import DXOS-specific helpers. Keep the config small and Node-only:

```ts
// vitest.shared.ts
import wasm from 'vite-plugin-wasm';
import { defineConfig } from 'vitest/config';

export const createConfig = async () =>
  defineConfig({
    plugins: [wasm()],
    test: {
      include: ['./{src,test}/**/*.test.ts'],
      environment: 'node',
      passWithNoTests: true,
      reporters: ['verbose'],
      server: {
        deps: {
          inline: true,
        },
      },
    },
  });
```

Required test coverage:

1. Import the built JS package from `dist`, not Rust internals.
2. Initialize the WASM module once.
3. Create an Automerge document, mutate it, save it, reload it, and verify state.
4. Exercise Automerge incremental load/save APIs.
5. Instantiate Subduction-side types such as `MemorySigner`, `Subduction`, `SedimentreeId`, and storage interfaces.
6. Verify `SedimentreeAutomerge` can wrap or use an Automerge document created from the same package.
7. Assert the package output contains exactly one production `.wasm` file.
8. Assert tests do not import `@automerge/automerge` or `@automerge/automerge-subduction` directly.
9. Add a regression test that imports both Automerge and Subduction symbols from the unified package in the same
   process and confirms initialization does not instantiate a second WASM module.

Example test shape:

```ts
import { describe, test } from 'vitest';

import init, {
  create,
  load,
  MemorySigner,
  Subduction,
  SedimentreeAutomerge,
} from '../dist/esm/node.js';

describe('unified wasm package', () => {
  test('uses one wasm module for automerge and subduction APIs', async ({ expect }) => {
    await init();

    const doc = create();
    expect(doc).toBeDefined();

    const saved = doc.save();
    const loaded = load(saved);
    expect(loaded).toBeDefined();

    const signer = MemorySigner.generate();
    expect(signer).toBeDefined();

    expect(Subduction).toBeDefined();
    expect(SedimentreeAutomerge).toBeDefined();
  });
});
```

The tests are part of the acceptance criteria: the package is not done until a JS consumer can use the generated WASM
module through the published package API without importing either upstream WASM package directly.

## Memory and Bundle Validation

Add bundle and runtime checks because the package exists to reduce Worker memory pressure:

- The production package must include exactly one `.wasm` file outside explicit debug exports.
- The consuming package path must not include upstream `@automerge/automerge/dist/*.wasm`.
- The consuming package path must not include upstream `@automerge/automerge-subduction/dist/*.wasm`.
- A smoke benchmark should compare baseline initialization against loading the two upstream packages separately.
- Document live-memory limits clearly: one WASM reduces duplicated baseline and allows internal allocator reuse, but
  one large Automerge operation can still grow the unified linear memory to the Worker limit.

## Acceptance Criteria

- `pnpm build` emits exactly one production WASM binary for the package.
- The Node package import path initializes that single WASM and exposes both Automerge and Subduction classes.
- `pnpm test` runs Node Vitest tests against the built JS package.
- A consuming repo does not load separate upstream Automerge or Subduction WASM files for the package import path.
- A memory smoke test demonstrates lower baseline memory than importing both current packages separately.
- API names are close enough that DXOS can swap low-level imports with a small compatibility wrapper rather than
  rewriting replication logic.
