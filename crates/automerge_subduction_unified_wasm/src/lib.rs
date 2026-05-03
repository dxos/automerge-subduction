//! Unified Wasm bindings for Automerge documents and Subduction replication.

#![allow(clippy::missing_const_for_fn)]

mod automerge_api;
mod automerge_change;
mod automerge_sync;
mod error;

pub use automerge_api::{create, load, Automerge};
pub use automerge_change::{decode_change, encode_change, read_bundle, wasm_release_info};
pub use automerge_sync::{
  decode_sync_message, decode_sync_state, encode_sync_message, encode_sync_state,
  export_sync_state, import_sync_state, init_sync_state,
};
pub use automerge_subduction_wasm::*;
pub use sedimentree_wasm::*;

use wasm_bindgen::prelude::*;

/// Entry point for the single final Wasm module.
#[wasm_bindgen(start)]
pub fn start() {
  #[cfg(feature = "console_error_panic_hook")]
  console_error_panic_hook::set_once();

  automerge_subduction_wasm::set_panic_hook();
}
