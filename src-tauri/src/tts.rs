use std::sync::mpsc;
use std::sync::OnceLock;

struct SpeakRequest {
    text: String,
    pitch: i32,
    rate: i32,
    volume: u16,
}

static SPEAK_TX: OnceLock<mpsc::Sender<SpeakRequest>> = OnceLock::new();

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

                while let Ok(req) = rx.recv() {
                    let _ = voice.SetVolume(req.volume);

                    let escaped = req
                        .text
                        .replace('&', "&amp;")
                        .replace('<', "&lt;")
                        .replace('>', "&gt;");

                    // SAPI pitch range is -24 to +24 half-tones (4 octaves!)
                    let pitch = req.pitch.clamp(-24, 24);
                    let rate = req.rate.clamp(-10, 10);

                    let xml = format!(
                        r#"<pitch absmiddle="{}"><rate absspeed="{}">{}</rate></pitch>"#,
                        pitch, rate, escaped
                    );

                    log::info!("SAPI speak: pitch={}, rate={}, text={}", pitch, rate, &req.text[..req.text.len().min(40)]);

                    let wide: Vec<u16> =
                        xml.encode_utf16().chain(std::iter::once(0)).collect();

                    // SPF_IS_XML(8) | SPF_ASYNC(1) | SPF_PURGEBEFORESPEAK(2)
                    let _ = voice.Speak(PCWSTR(wide.as_ptr()), 11, None);
                }

                CoUninitialize();
            }
        });

        tx
    })
}

/// Speak text using Windows SAPI with pitch/rate XML control.
/// pitch: -10 to +10 (0 = normal, positive = higher)
/// rate: -10 to +10 (0 = normal, positive = faster)
pub fn speak(text: String, pitch: i32, rate: i32, volume: u16) {
    let tx = get_sender();
    let _ = tx.send(SpeakRequest {
        text,
        pitch,
        rate,
        volume: volume.min(100),
    });
}
