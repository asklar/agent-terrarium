//! Extract file icons/thumbnails as base64 PNG data URLs.
//! For image files, generates a thumbnail. For others, extracts the Windows shell icon.

use std::io::Cursor;
use std::path::Path;

use windows::Win32::Graphics::Gdi::*;
use windows::Win32::UI::Shell::*;
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::core::PCWSTR;

const THUMB_SIZE: u32 = 48;

/// Get the icon/thumbnail for a file path as a base64 PNG data URL.
/// For image files (png, jpg, gif, bmp, webp), generates a thumbnail.
/// For other files, extracts the Windows shell icon.
pub fn get_file_icon_data_url(path: &str) -> Result<String, String> {
    log::info!("Extracting icon for: {}", path);

    // Try thumbnail for image files
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "ico") {
        if let Ok(url) = generate_thumbnail(path) {
            return Ok(url);
        }
        // Fall through to shell icon on failure
    }

    get_shell_icon(path)
}

fn generate_thumbnail(path: &str) -> Result<String, String> {
    let img = image::open(path).map_err(|e| format!("Image open: {}", e))?;
    let thumb = img.thumbnail(THUMB_SIZE, THUMB_SIZE);
    let rgba = thumb.to_rgba8();
    let mut png_buf = Cursor::new(Vec::new());
    rgba.write_to(&mut png_buf, image::ImageFormat::Png)
        .map_err(|e| format!("PNG encode: {}", e))?;
    let b64 = base64_encode(&png_buf.into_inner());
    log::info!("Thumbnail generated: {}x{}", rgba.width(), rgba.height());
    Ok(format!("data:image/png;base64,{}", b64))
}

fn get_shell_icon(path: &str) -> Result<String, String> {
    unsafe {
        let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();

        let mut shfi = SHFILEINFOW::default();
        let result = SHGetFileInfoW(
            PCWSTR(wide_path.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );

        if result == 0 {
            log::warn!("SHGetFileInfo failed for: {}", path);
            return Err("SHGetFileInfo failed".to_string());
        }

        let hicon = shfi.hIcon;
        if hicon.is_invalid() {
            log::warn!("No icon returned for: {}", path);
            return Err("No icon returned".to_string());
        }

        let result = icon_to_png_data_url(hicon);
        let _ = DestroyIcon(hicon);
        match &result {
            Ok(url) => log::info!("Icon extracted: {} bytes", url.len()),
            Err(e) => log::warn!("Icon extraction failed: {}", e),
        }
        result
    }
}

unsafe fn icon_to_png_data_url(hicon: HICON) -> Result<String, String> {
    let mut icon_info = ICONINFO::default();
    GetIconInfo(hicon, &mut icon_info).map_err(|e| format!("GetIconInfo: {}", e))?;

    // Get bitmap dimensions
    let mut bmp = BITMAP::default();
    GetObjectW(
        icon_info.hbmColor.into(),
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bmp as *mut BITMAP as *mut _),
    );

    let width = bmp.bmWidth as u32;
    let height = bmp.bmHeight as u32;
    if width == 0 || height == 0 {
        if !icon_info.hbmColor.is_invalid() { let _ = DeleteObject(icon_info.hbmColor.into()); }
        if !icon_info.hbmMask.is_invalid() { let _ = DeleteObject(icon_info.hbmMask.into()); }
        return Err("Zero-size icon".to_string());
    }

    // Extract RGBA pixels using GetDIBits
    let hdc = CreateCompatibleDC(None);
    let mut bi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32), // top-down
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0, // BI_RGB
            ..Default::default()
        },
        ..Default::default()
    };

    let mut pixels = vec![0u8; (width * height * 4) as usize];
    GetDIBits(
        hdc,
        icon_info.hbmColor,
        0,
        height,
        Some(pixels.as_mut_ptr() as *mut _),
        &mut bi,
        DIB_RGB_COLORS,
    );

    let _ = DeleteDC(hdc);
    if !icon_info.hbmColor.is_invalid() { let _ = DeleteObject(icon_info.hbmColor.into()); }
    if !icon_info.hbmMask.is_invalid() { let _ = DeleteObject(icon_info.hbmMask.into()); }

    // Convert BGRA → RGBA
    for chunk in pixels.chunks_exact_mut(4) {
        chunk.swap(0, 2);
    }

    // Encode as PNG using the image crate
    let img = image::RgbaImage::from_raw(width, height, pixels)
        .ok_or("Failed to create image buffer")?;
    let mut png_buf = Cursor::new(Vec::new());
    img.write_to(&mut png_buf, image::ImageFormat::Png)
        .map_err(|e| format!("PNG encode: {}", e))?;

    // Base64 encode
    let png_bytes = png_buf.into_inner();
    let b64 = base64_encode(&png_bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i] as u32;
        let b1 = if i + 1 < data.len() { data[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        result.push(if i + 1 < data.len() { CHARS[((triple >> 6) & 0x3F) as usize] as char } else { '=' });
        result.push(if i + 2 < data.len() { CHARS[(triple & 0x3F) as usize] as char } else { '=' });
        i += 3;
    }
    result
}
