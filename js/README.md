# @dxos/automerge-subduction-unified

Unified WASM bindings for Automerge documents and Subduction replication.

This package exposes Automerge and Subduction APIs from one shared WebAssembly module. The package shape follows the Subduction WASM packages: Node, browser/bundler, Workerd, slim, raw WASM, and base64 entrypoints are published from `dist`.

## Build

```sh
pnpm build
pnpm test
```

The build uses `wasm-pack` to produce raw `pkg`, `pkg-node`, and `pkg-slim` outputs, then assembles the published `dist` package.
