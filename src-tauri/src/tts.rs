use std::sync::mpsc;
use std::sync::OnceLock;

struct SpeakRequest {
    text: String,
    rate: i32,
    volume: u16,
    voice_index: u32,
}

static SPEAK_TX: OnceLock<mpsc::Sender<SpeakRequest>> = OnceLock::new();

/// Returns (voice_count, list of voice names) after enumerating SAPI voices.
unsafe fn enumerate_voices(
    _voice: &windows::Win32::Media::Speech::ISpVoice,
) -> Vec<windows::Win32::Media::Speech::ISpObjectToken> {
    use windows::Win32::Media::Speech::*;
    use windows::core::PCWSTR;

    let category_id: Vec<u16> = "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    let mut tokens = Vec::new();

    // Use ISpeechVoice::GetVoices via the automation interface
    // Alternatively, enumerate via SpObjectTokenCategory
    let cat: ISpObjectTokenCategory = match windows::Win32::System::Com::CoCreateInstance(
        &SpObjectTokenCategory,
        None,
        windows::Win32::System::Com::CLSCTX_ALL,
    ) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("Failed to create SpObjectTokenCategory: {}", e);
            return tokens;
        }
    };

    if cat.SetId(PCWSTR(category_id.as_ptr()), false).is_err() {
        log::warn!("Failed to set voice category ID");
        return tokens;
    }

    let enum_tokens: IEnumSpObjectTokens = match cat.EnumTokens(PCWSTR::null(), PCWSTR::null()) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("Failed to enumerate voice tokens: {}", e);
            return tokens;
        }
    };

    let mut count = 0u32;
    let _ = enum_tokens.GetCount(&mut count);
    log::info!("SAPI: Found {} voices", count);

    for i in 0..count {
        let mut token: Option<ISpObjectToken> = None;
        if enum_tokens.Next(1, &mut token, None).is_ok() {
            if let Some(t) = token {
                // Try to get description
                if let Ok(desc_pwstr) = t.GetStringValue(PCWSTR::null()) {
                    let desc = wideptr_to_string(desc_pwstr.0);
                    log::info!("  Voice {}: {}", i, desc);
                }
                tokens.push(t);
            }
        }
    }

    tokens
}

unsafe fn wideptr_to_string(ptr: *mut u16) -> String {
    let mut len = 0;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
}

fn get_sender() -> &'static mpsc::Sender<SpeakRequest> {
    SPEAK_TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<SpeakRequest>();

        std::thread::spawn(move || {
            unsafe {
                use windows::core::PCWSTR;
                use windows::Win32::Media::Speech::*;
                use windows::Win32::System::Com::*;

                let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

                let voice: ISpVoice = match CoCreateInstance(&SpVoice, None, CLSCTX_ALL) {
                    Ok(v) => v,
                    Err(e) => {
                        log::error!("Failed to create SAPI voice: {}", e);
                        while rx.recv().is_ok() {}
                        return;
                    }
                };

                log::info!("SAPI voice created successfully");

                // Enumerate available voices for selection
                let voices = enumerate_voices(&voice);
                let voice_count = voices.len() as u32;

                while let Ok(req) = rx.recv() {
                    // Select voice based on voice_index
                    if voice_count > 0 {
                        let idx = req.voice_index % voice_count;
                        if let Err(e) = voice.SetVoice(&voices[idx as usize]) {
                            log::warn!("SetVoice({}) failed: {}", idx, e);
                        }
                    }

                    // SetRate works on ALL voices (not XML-dependent)
                    let rate = req.rate.clamp(-10, 10);
                    if let Err(e) = voice.SetRate(rate) {
                        log::warn!("SetRate({}) failed: {}", rate, e);
                    }

                    let _ = voice.SetVolume(req.volume);

                    let wide: Vec<u16> =
                        req.text.encode_utf16().chain(std::iter::once(0)).collect();

                    log::info!(
                        "SAPI speak: voice_idx={}, rate={}, text={}",
                        req.voice_index % voice_count.max(1),
                        rate,
                        &req.text[..req.text.len().min(40)]
                    );

                    // SPF_ASYNC(1) | SPF_PURGEBEFORESPEAK(2) = 3
                    let _ = voice.Speak(PCWSTR(wide.as_ptr()), 3, None);
                }

                CoUninitialize();
            }
        });

        tx
    })
}

/// Speak text using Windows SAPI.
/// rate: -10 to +10 (0 = normal, positive = faster — chipmunk effect)
/// voice_index: selects which SAPI voice to use (wraps around)
pub fn speak(text: String, rate: i32, volume: u16, voice_index: u32) {
    let tx = get_sender();
    let _ = tx.send(SpeakRequest {
        text,
        rate,
        volume: volume.min(100),
        voice_index,
    });
}
