use std::sync::mpsc;
use std::sync::OnceLock;

struct SpeakRequest {
    text: String,
    voice_index: u32,
    rate: i32,
    result_tx: mpsc::Sender<Result<Vec<u8>, String>>,
}

static SPEAK_TX: OnceLock<mpsc::Sender<SpeakRequest>> = OnceLock::new();

fn get_sender() -> &'static mpsc::Sender<SpeakRequest> {
    SPEAK_TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<SpeakRequest>();

        std::thread::spawn(move || {
            unsafe {
                use windows::Win32::Media::Speech::*;
                use windows::Win32::System::Com::*;

                let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

                let voice: ISpVoice = match CoCreateInstance(&SpVoice, None, CLSCTX_ALL) {
                    Ok(v) => v,
                    Err(e) => {
                        log::error!("Failed to create SAPI voice: {}", e);
                        while let Ok(req) = rx.recv() {
                            let _ = req.result_tx.send(Err(format!("No SAPI: {}", e)));
                        }
                        return;
                    }
                };

                log::info!("SAPI voice created successfully");
                let voices = enumerate_voices();
                let voice_count = voices.len() as u32;

                while let Ok(req) = rx.recv() {
                    let result =
                        render_wav(&voice, &req.text, req.voice_index, &voices, voice_count, req.rate);
                    let _ = req.result_tx.send(result);
                }

                CoUninitialize();
            }
        });

        tx
    })
}

unsafe fn enumerate_voices() -> Vec<windows::Win32::Media::Speech::ISpObjectToken> {
    use windows::core::PCWSTR;
    use windows::Win32::Media::Speech::*;
    use windows::Win32::System::Com::*;

    let category_id: Vec<u16> = "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    let mut tokens = Vec::new();

    let cat: ISpObjectTokenCategory = match CoCreateInstance(&SpObjectTokenCategory, None, CLSCTX_ALL) {
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

unsafe fn render_wav(
    voice: &windows::Win32::Media::Speech::ISpVoice,
    text: &str,
    voice_index: u32,
    voices: &[windows::Win32::Media::Speech::ISpObjectToken],
    voice_count: u32,
    rate: i32,
) -> Result<Vec<u8>, String> {
    use windows::core::PCWSTR;
    use windows::Win32::Media::Speech::*;
    use windows::Win32::System::Com::*;

    // Select voice
    if voice_count > 0 {
        let idx = voice_index % voice_count;
        if let Err(e) = voice.SetVoice(&voices[idx as usize]) {
            log::warn!("SetVoice({}) failed: {}", idx, e);
        }
    }

    // Set SAPI speech rate (affects cadence/timing of generated speech)
    let rate = rate.clamp(-10, 10);
    if let Err(e) = voice.SetRate(rate) {
        log::warn!("SetRate({}) failed: {}", rate, e);
    }

    // Create memory-backed IStream
    let istream = StructuredStorage::CreateStreamOnHGlobal(
        windows::Win32::Foundation::HGLOBAL::default(),
        true,
    )
    .map_err(|e| format!("CreateStreamOnHGlobal: {}", e))?;

    // Create ISpStream and set base stream with WAV format
    let sp_stream: ISpStream =
        CoCreateInstance(&SpStream, None, CLSCTX_ALL).map_err(|e| format!("SpStream: {}", e))?;

    // WAVEFORMATEX: 22050 Hz, 16-bit, mono PCM
    let format = windows::Win32::Media::Audio::WAVEFORMATEX {
        wFormatTag: 1, // WAVE_FORMAT_PCM
        nChannels: 1,
        nSamplesPerSec: 22050,
        nAvgBytesPerSec: 44100,
        nBlockAlign: 2,
        wBitsPerSample: 16,
        cbSize: 0,
    };

    // SPDFID_WaveFormatEx GUID
    let guid = windows::core::GUID::from_values(
        0xC31ADBAE,
        0x527F,
        0x4FF5,
        [0xA2, 0x30, 0xF6, 0x2B, 0xB6, 0x1F, 0xF7, 0x0C],
    );

    sp_stream
        .SetBaseStream(&istream, &guid, &format)
        .map_err(|e| format!("SetBaseStream: {}", e))?;

    // Redirect voice output to our stream
    voice
        .SetOutput(&sp_stream, false)
        .map_err(|e| format!("SetOutput: {}", e))?;

    // Speak synchronously (SPF_DEFAULT = 0)
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    voice
        .Speak(PCWSTR(wide.as_ptr()), 0, None)
        .map_err(|e| format!("Speak: {}", e))?;

    // Restore default output
    let _ = voice.SetOutput(None, true);

    // Seek stream to beginning
    istream
        .Seek(0, STREAM_SEEK_SET, None)
        .map_err(|e| format!("Seek: {}", e))?;

    // Get stream size
    let mut stat = std::mem::zeroed::<STATSTG>();
    istream
        .Stat(&mut stat, STATFLAG_NONAME)
        .map_err(|e| format!("Stat: {}", e))?;
    let size = stat.cbSize as usize;

    if size == 0 {
        return Err("SAPI produced no audio".to_string());
    }

    // Read raw PCM bytes
    let mut pcm_data = vec![0u8; size];
    let mut bytes_read = 0u32;
    let hr = istream.Read(
        pcm_data.as_mut_ptr() as *mut _,
        size as u32,
        Some(&mut bytes_read),
    );
    if hr.is_err() {
        return Err(format!("Read: {:?}", hr));
    }
    pcm_data.truncate(bytes_read as usize);

    log::info!(
        "SAPI rendered {} bytes of PCM audio for voice_idx={}",
        pcm_data.len(),
        voice_index % voice_count.max(1)
    );

    // Build WAV file (header + PCM data)
    let wav = build_wav(&format, &pcm_data);
    Ok(wav)
}

fn build_wav(fmt: &windows::Win32::Media::Audio::WAVEFORMATEX, data: &[u8]) -> Vec<u8> {
    let data_len = data.len() as u32;
    let mut wav = Vec::with_capacity(44 + data.len());
    // RIFF header
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    // fmt chunk
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&fmt.wFormatTag.to_le_bytes());
    wav.extend_from_slice(&fmt.nChannels.to_le_bytes());
    wav.extend_from_slice(&fmt.nSamplesPerSec.to_le_bytes());
    wav.extend_from_slice(&fmt.nAvgBytesPerSec.to_le_bytes());
    wav.extend_from_slice(&fmt.nBlockAlign.to_le_bytes());
    wav.extend_from_slice(&fmt.wBitsPerSample.to_le_bytes());
    // data chunk
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(data);
    wav
}

unsafe fn wideptr_to_string(ptr: *mut u16) -> String {
    let mut len = 0;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
}

/// Render text to a pitch-shiftable WAV buffer via SAPI.
/// Returns WAV bytes that the frontend can play with AudioBufferSourceNode.playbackRate.
pub fn speak_to_wav(text: String, voice_index: u32, rate: i32) -> Result<Vec<u8>, String> {
    let (result_tx, result_rx) = mpsc::channel();
    let tx = get_sender();
    tx.send(SpeakRequest {
        text,
        voice_index,
        rate,
        result_tx,
    })
    .map_err(|e| e.to_string())?;
    result_rx.recv().map_err(|e| e.to_string())?
}
