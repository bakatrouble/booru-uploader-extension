use wasm_bindgen::prelude::*;

pub fn set_panic_hook() {
    // When the `console_error_panic_hook` feature is enabled, we can call the
    // `set_panic_hook` function at least once during initialization, and then
    // we will get better error messages if our code ever panics.
    //
    // For more details see
    // https://github.com/rustwasm/console_error_panic_hook#readme
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn imagehash(image_bytes: &[u8]) -> String {
    set_panic_hook();

    let img = image::load_from_memory(image_bytes)
        .expect("Failed to load image from bytes");
    let hasher = imagehash::PerceptualHash::new()
        .with_image_size(8, 8)
        .with_hash_size(8, 8);
    hasher.hash(&img).to_string()
}
