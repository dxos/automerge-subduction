use wasm_bindgen::prelude::*;

pub(crate) fn js_error(error: impl core::fmt::Display) -> JsValue {
  JsValue::from_str(&error.to_string())
}
