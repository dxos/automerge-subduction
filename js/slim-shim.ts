import init, * as unified from './automerge_subduction_unified_wasm.js';

export * from './automerge_subduction_unified_wasm.js';

export function initFromBase64(base64Wasm: string) {
  const decoder =
    typeof atob === 'function'
      ? atob
      : (value: string) => Buffer.from(value, 'base64').toString('binary');

  const wasm = new Uint8Array(
    decoder(base64Wasm)
      .split('')
      .map((char) => char.charCodeAt(0)),
  );

  return init({ module_or_path: wasm });
}

export default unified;
