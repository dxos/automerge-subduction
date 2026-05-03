# automerge-subduction
Unified Rust/WASM bindings for Automerge documents and Subduction replication, published as a single JavaScript package with one shared WebAssembly module for memory-constrained runtimes like Cloudflare Workers.

## Build

This repository produces one Rust `cdylib` and one JavaScript package:

```sh
pnpm install
pnpm build
pnpm test
```

The build expects `wasm-pack` to be available on `PATH`.

## Package Shape

The JavaScript package is emitted under `js/dist` and exposes Automerge document bindings plus Subduction/Sedimentree bindings from the same generated WebAssembly module.
