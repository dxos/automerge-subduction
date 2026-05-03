use automerge::{transaction::Transactable, AutoCommit, ObjType, ReadDoc, ROOT};
use js_sys::{Array, Object, Reflect, Uint8Array};
use wasm_bindgen::prelude::*;

use crate::error::js_error;

/// Wasm-facing Automerge document wrapper.
#[wasm_bindgen]
pub struct Automerge {
  doc: AutoCommit,
}

#[wasm_bindgen]
impl Automerge {
  /// Create an empty Automerge document.
  #[wasm_bindgen(constructor)]
  pub fn new() -> Self {
    Self {
      doc: AutoCommit::new(),
    }
  }

  /// Save the full document.
  pub fn save(&mut self) -> Vec<u8> {
    self.doc.save()
  }

  /// Save changes since the last full or incremental save.
  #[wasm_bindgen(js_name = saveIncremental)]
  pub fn save_incremental(&mut self) -> Vec<u8> {
    self.doc.save_incremental()
  }

  /// Load incremental changes into this document.
  #[wasm_bindgen(js_name = loadIncremental)]
  pub fn load_incremental(&mut self, data: &[u8]) -> Result<(), JsValue> {
    self.doc.load_incremental(data).map(|_| ()).map_err(js_error)
  }

  /// Put a scalar value at the root object.
  pub fn put(&mut self, prop: &str, value: JsValue) -> Result<(), JsValue> {
    if let Some(value) = value.as_string() {
      self.doc.put(ROOT, prop, value).map_err(js_error)?;
    } else if let Some(value) = value.as_bool() {
      self.doc.put(ROOT, prop, value).map_err(js_error)?;
    } else if let Some(value) = value.as_f64() {
      self.doc.put(ROOT, prop, value).map_err(js_error)?;
    } else if value.is_null() || value.is_undefined() {
      self.doc.put(ROOT, prop, ()).map_err(js_error)?;
    } else {
      return Err(JsValue::from_str(
        "unsupported Automerge.put value: expected string, number, boolean, null, or undefined",
      ));
    }

    Ok(())
  }

  /// Put a nested map at the root object and return its object id as a string.
  #[wasm_bindgen(js_name = putObject)]
  pub fn put_object(&mut self, prop: &str) -> Result<String, JsValue> {
    self.doc
      .put_object(ROOT, prop, ObjType::Map)
      .map(|obj| obj.to_string())
      .map_err(js_error)
  }

  /// Read a scalar value from the root object.
  pub fn get(&self, prop: &str) -> Result<JsValue, JsValue> {
    let Some((value, _id)) = self.doc.get(ROOT, prop).map_err(js_error)? else {
      return Ok(JsValue::UNDEFINED);
    };

    Ok(match value {
      automerge::Value::Scalar(value) => scalar_to_js(&value),
      automerge::Value::Object(kind) => JsValue::from_str(&format!("{kind:?}")),
    })
  }

  /// Return the document heads as byte arrays.
  pub fn heads(&mut self) -> Array {
    self
      .doc
      .get_heads()
      .into_iter()
      .map(|hash| JsValue::from(Uint8Array::from(hash.0.as_slice())))
      .collect()
  }

  /// Commit metadata lookup used by `SedimentreeAutomerge`.
  #[wasm_bindgen(js_name = getChangeMetaByHash)]
  pub fn get_change_meta_by_hash(&mut self, hash_hex: String) -> Result<JsValue, JsValue> {
    let Some(hash) = parse_change_hash(&hash_hex) else {
      return Ok(JsValue::NULL);
    };

    let Some(change) = self.doc.get_change_by_hash(&hash) else {
      return Ok(JsValue::NULL);
    };

    let meta = Object::new();
    Reflect::set(
      &meta,
      &JsValue::from_str("hash"),
      &Uint8Array::from(hash.0.as_slice()),
    )?;

    let deps = Array::new();
    for dep in change.deps() {
      deps.push(&Uint8Array::from(dep.0.as_slice()));
    }
    Reflect::set(&meta, &JsValue::from_str("deps"), &deps)?;

    Ok(meta.into())
  }
}

impl Default for Automerge {
  fn default() -> Self {
    Self::new()
  }
}

/// Create an empty Automerge document.
#[wasm_bindgen]
pub fn create() -> Automerge {
  Automerge::new()
}

/// Load a full Automerge document.
#[wasm_bindgen]
pub fn load(data: &[u8]) -> Result<Automerge, JsValue> {
  AutoCommit::load(data)
    .map(|doc| Automerge { doc })
    .map_err(js_error)
}

fn scalar_to_js(value: &automerge::ScalarValue) -> JsValue {
  match value {
    automerge::ScalarValue::Str(value) => JsValue::from_str(value),
    automerge::ScalarValue::Int(value) => JsValue::from_f64(*value as f64),
    automerge::ScalarValue::Uint(value) => JsValue::from_f64(*value as f64),
    automerge::ScalarValue::F64(value) => JsValue::from_f64(*value),
    automerge::ScalarValue::Boolean(value) => JsValue::from_bool(*value),
    automerge::ScalarValue::Null => JsValue::NULL,
    _ => JsValue::UNDEFINED,
  }
}

fn parse_change_hash(hash_hex: &str) -> Option<automerge::ChangeHash> {
  if hash_hex.len() != 64 {
    return None;
  }

  let mut bytes = [0u8; 32];
  for (index, chunk) in hash_hex.as_bytes().chunks_exact(2).enumerate() {
    let hex = core::str::from_utf8(chunk).ok()?;
    bytes[index] = u8::from_str_radix(hex, 16).ok()?;
  }

  Some(automerge::ChangeHash(bytes))
}
