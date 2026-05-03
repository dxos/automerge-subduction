use js_sys::{Object, Reflect, Uint8Array};
use wasm_bindgen::prelude::*;

/// Encode a decoded change-like value back to bytes.
#[wasm_bindgen(js_name = encodeChange)]
pub fn encode_change(change: JsValue) -> Result<Vec<u8>, JsValue> {
  if change.is_instance_of::<Uint8Array>() {
    Ok(Uint8Array::new(&change).to_vec())
  } else {
    Err(JsValue::from_str(
      "encodeChange currently expects the Uint8Array returned by decodeChange",
    ))
  }
}

/// Decode change bytes into a byte-preserving JS representation.
#[wasm_bindgen(js_name = decodeChange)]
pub fn decode_change(change: &[u8]) -> Uint8Array {
  Uint8Array::from(change)
}

/// Read an Automerge bundle.
#[wasm_bindgen(js_name = readBundle)]
pub fn read_bundle(bundle: &[u8]) -> Uint8Array {
  Uint8Array::from(bundle)
}

/// Return release metadata for diagnostics.
#[wasm_bindgen(js_name = wasmReleaseInfo)]
pub fn wasm_release_info() -> Result<JsValue, JsValue> {
  let info = Object::new();
  Reflect::set(
    &info,
    &JsValue::from_str("name"),
    &JsValue::from_str(env!("CARGO_PKG_NAME")),
  )?;
  Reflect::set(
    &info,
    &JsValue::from_str("version"),
    &JsValue::from_str(env!("CARGO_PKG_VERSION")),
  )?;
  Ok(info.into())
}
