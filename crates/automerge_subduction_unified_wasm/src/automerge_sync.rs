use wasm_bindgen::prelude::*;

/// Create a new opaque sync state.
#[wasm_bindgen(js_name = initSyncState)]
pub fn init_sync_state() -> Vec<u8> {
  Vec::new()
}

/// Encode an opaque sync state.
#[wasm_bindgen(js_name = encodeSyncState)]
pub fn encode_sync_state(state: &[u8]) -> Vec<u8> {
  state.to_vec()
}

/// Decode an opaque sync state.
#[wasm_bindgen(js_name = decodeSyncState)]
pub fn decode_sync_state(state: &[u8]) -> Vec<u8> {
  state.to_vec()
}

/// Export an opaque sync state.
#[wasm_bindgen(js_name = exportSyncState)]
pub fn export_sync_state(state: &[u8]) -> Vec<u8> {
  state.to_vec()
}

/// Import an opaque sync state.
#[wasm_bindgen(js_name = importSyncState)]
pub fn import_sync_state(state: &[u8]) -> Vec<u8> {
  state.to_vec()
}

/// Encode an opaque sync message.
#[wasm_bindgen(js_name = encodeSyncMessage)]
pub fn encode_sync_message(message: &[u8]) -> Vec<u8> {
  message.to_vec()
}

/// Decode an opaque sync message.
#[wasm_bindgen(js_name = decodeSyncMessage)]
pub fn decode_sync_message(message: &[u8]) -> Vec<u8> {
  message.to_vec()
}
