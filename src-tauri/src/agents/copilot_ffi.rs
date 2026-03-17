//! FFI bindings to the Go copilot-bridge DLL.
//!
//! The Go bridge wraps the official GitHub Copilot SDK (protocol v3)
//! and exposes a C ABI that we call via libloading.

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::path::PathBuf;
use std::sync::OnceLock;

use libloading::{Library, Symbol};

/// Singleton holder for the loaded DLL
static BRIDGE: OnceLock<CopilotBridge> = OnceLock::new();

struct CopilotBridge {
    _lib: Library,

    // Function pointers — kept as raw addresses since Library must outlive them
    fn_init: unsafe extern "C" fn(*mut *mut c_char) -> c_int,
    fn_stop: unsafe extern "C" fn(),
    fn_create_session:
        unsafe extern "C" fn(*const c_char, *mut *mut c_char, *mut *mut c_char) -> c_int,
    fn_resume_session:
        unsafe extern "C" fn(*const c_char, *const c_char, *mut *mut c_char, *mut *mut c_char) -> c_int,
    fn_send_and_wait:
        unsafe extern "C" fn(*const c_char, *const c_char, c_int, *mut *mut c_char, *mut *mut c_char) -> c_int,
    fn_create_session_with_tools:
        unsafe extern "C" fn(*const c_char, *const c_char, *mut *mut c_char, *mut *mut c_char) -> c_int,
    fn_send_with_tools:
        unsafe extern "C" fn(*const c_char, *const c_char, c_int, *mut *mut c_char, *mut *mut c_char) -> c_int,
    fn_set_tool_callback:
        unsafe extern "C" fn(Option<unsafe extern "C" fn(*mut c_char, *mut c_char, *mut c_char) -> *mut c_char>),
    fn_destroy_session: unsafe extern "C" fn(*const c_char),
    fn_list_models: unsafe extern "C" fn(*mut *mut c_char, *mut *mut c_char) -> c_int,
    fn_free_string: unsafe extern "C" fn(*mut c_char),
}

// Safety: The Go DLL handles its own thread safety via mutexes
unsafe impl Send for CopilotBridge {}
unsafe impl Sync for CopilotBridge {}

impl CopilotBridge {
    fn load() -> Result<Self, String> {
        let dll_path = Self::find_dll()?;
        log::info!("Loading copilot bridge from: {:?}", dll_path);

        unsafe {
            let lib = Library::new(&dll_path)
                .map_err(|e| format!("Failed to load copilot_bridge.dll: {}", e))?;

            macro_rules! load_fn {
                ($name:expr) => {
                    **lib.get::<Symbol<_>>($name)
                        .map_err(|e| format!("Missing symbol {}: {}", std::str::from_utf8($name).unwrap(), e))?
                };
            }

            let bridge = CopilotBridge {
                fn_init: load_fn!(b"copilot_init\0"),
                fn_stop: load_fn!(b"copilot_stop\0"),
                fn_create_session: load_fn!(b"copilot_create_session\0"),
                fn_resume_session: load_fn!(b"copilot_resume_session\0"),
                fn_send_and_wait: load_fn!(b"copilot_send_and_wait\0"),
                fn_create_session_with_tools: load_fn!(b"copilot_create_session_with_tools\0"),
                fn_send_with_tools: load_fn!(b"copilot_send_with_tools\0"),
                fn_set_tool_callback: load_fn!(b"copilot_set_tool_callback\0"),
                fn_destroy_session: load_fn!(b"copilot_destroy_session\0"),
                fn_list_models: load_fn!(b"copilot_list_models\0"),
                fn_free_string: load_fn!(b"copilot_free_string\0"),
                _lib: lib,
            };

            Ok(bridge)
        }
    }

    fn find_dll() -> Result<PathBuf, String> {
        // Search order: next to exe, in copilot-bridge dir, CWD
        let candidates = [
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.join("copilot_bridge.dll"))),
            Some(PathBuf::from("src-tauri/copilot-bridge/copilot_bridge.dll")),
            Some(PathBuf::from("copilot-bridge/copilot_bridge.dll")),
            Some(PathBuf::from("copilot_bridge.dll")),
        ];

        for candidate in candidates.iter().flatten() {
            if candidate.exists() {
                return Ok(candidate.clone());
            }
        }

        Err("copilot_bridge.dll not found".to_string())
    }

    /// Take a Go-allocated C string, convert to Rust String, and free the C memory.
    unsafe fn take_go_string(&self, ptr: *mut c_char) -> String {
        if ptr.is_null() {
            return String::new();
        }
        let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        (self.fn_free_string)(ptr);
        s
    }
}

/// Get or initialize the bridge singleton
fn bridge() -> Result<&'static CopilotBridge, String> {
    if let Some(b) = BRIDGE.get() {
        return Ok(b);
    }
    let b = CopilotBridge::load()?;
    // Ignore error if another thread already initialized
    let _ = BRIDGE.set(b);
    BRIDGE.get().ok_or_else(|| "Bridge initialization failed".to_string())
}

/// Initialize the Copilot client (spawns CLI server)
pub fn init() -> Result<(), String> {
    let b = bridge()?;
    unsafe {
        let mut err_ptr: *mut c_char = std::ptr::null_mut();
        let rc = (b.fn_init)(&mut err_ptr);
        if rc != 0 {
            let msg = b.take_go_string(err_ptr);
            return Err(msg);
        }
    }
    Ok(())
}

/// Stop the Copilot client
pub fn stop() {
    if let Ok(b) = bridge() {
        unsafe { (b.fn_stop)() }
    }
}

/// Create a new chat session. Returns the session ID.
pub fn create_session(config_json: &str) -> Result<String, String> {
    let b = bridge()?;
    let c_config = CString::new(config_json).map_err(|e| e.to_string())?;
    unsafe {
        let mut sid_ptr: *mut c_char = std::ptr::null_mut();
        let mut err_ptr: *mut c_char = std::ptr::null_mut();
        let rc = (b.fn_create_session)(c_config.as_ptr(), &mut sid_ptr, &mut err_ptr);
        if rc != 0 {
            return Err(b.take_go_string(err_ptr));
        }
        Ok(b.take_go_string(sid_ptr))
    }
}

/// Resume a previously saved session. Returns the session ID.
pub fn resume_session(saved_id: &str, config_json: &str) -> Result<String, String> {
    let b = bridge()?;
    let c_id = CString::new(saved_id).map_err(|e| e.to_string())?;
    let c_config = CString::new(config_json).map_err(|e| e.to_string())?;
    unsafe {
        let mut sid_ptr: *mut c_char = std::ptr::null_mut();
        let mut err_ptr: *mut c_char = std::ptr::null_mut();
        let rc = (b.fn_resume_session)(c_id.as_ptr(), c_config.as_ptr(), &mut sid_ptr, &mut err_ptr);
        if rc != 0 {
            return Err(b.take_go_string(err_ptr));
        }
        Ok(b.take_go_string(sid_ptr))
    }
}

/// Send a message and wait for the response. Returns the assistant's reply.
pub fn send_and_wait(session_id: &str, prompt: &str, timeout_secs: i32) -> Result<String, String> {
    let b = bridge()?;
    let c_sid = CString::new(session_id).map_err(|e| e.to_string())?;
    let c_prompt = CString::new(prompt).map_err(|e| e.to_string())?;
    unsafe {
        let mut resp_ptr: *mut c_char = std::ptr::null_mut();
        let mut err_ptr: *mut c_char = std::ptr::null_mut();
        let rc = (b.fn_send_and_wait)(
            c_sid.as_ptr(),
            c_prompt.as_ptr(),
            timeout_secs as c_int,
            &mut resp_ptr,
            &mut err_ptr,
        );
        if rc != 0 {
            return Err(b.take_go_string(err_ptr));
        }
        Ok(b.take_go_string(resp_ptr))
    }
}

/// Create a session with tool support. Tools are defined as JSON.
pub fn create_session_with_tools(config_json: &str, tools_json: &str) -> Result<String, String> {
    let b = bridge()?;
    let c_config = CString::new(config_json).map_err(|e| e.to_string())?;
    let c_tools = CString::new(tools_json).map_err(|e| e.to_string())?;
    unsafe {
        let mut sid_ptr: *mut c_char = std::ptr::null_mut();
        let mut err_ptr: *mut c_char = std::ptr::null_mut();
        let rc = (b.fn_create_session_with_tools)(
            c_config.as_ptr(),
            c_tools.as_ptr(),
            &mut sid_ptr,
            &mut err_ptr,
        );
        if rc != 0 {
            return Err(b.take_go_string(err_ptr));
        }
        Ok(b.take_go_string(sid_ptr))
    }
}

/// Send a message on a tool-enabled session.
pub fn send_with_tools(session_id: &str, prompt: &str, timeout_secs: i32) -> Result<String, String> {
    let b = bridge()?;
    let c_sid = CString::new(session_id).map_err(|e| e.to_string())?;
    let c_prompt = CString::new(prompt).map_err(|e| e.to_string())?;
    unsafe {
        let mut resp_ptr: *mut c_char = std::ptr::null_mut();
        let mut err_ptr: *mut c_char = std::ptr::null_mut();
        let rc = (b.fn_send_with_tools)(
            c_sid.as_ptr(),
            c_prompt.as_ptr(),
            timeout_secs as c_int,
            &mut resp_ptr,
            &mut err_ptr,
        );
        if rc != 0 {
            return Err(b.take_go_string(err_ptr));
        }
        Ok(b.take_go_string(resp_ptr))
    }
}

/// Register a tool callback that Go will invoke when the model calls a tool.
/// The callback receives (session_id, tool_name, args_json) and returns result_json.
///
/// # Safety
/// The callback must return a pointer allocated with libc::malloc (Go will free it with C.free).
pub fn set_tool_callback(
    cb: Option<unsafe extern "C" fn(*mut c_char, *mut c_char, *mut c_char) -> *mut c_char>,
) {
    if let Ok(b) = bridge() {
        unsafe { (b.fn_set_tool_callback)(cb) }
    }
}

/// Destroy a session
pub fn destroy_session(session_id: &str) {
    if let Ok(b) = bridge() {
        if let Ok(c_sid) = CString::new(session_id) {
            unsafe { (b.fn_destroy_session)(c_sid.as_ptr()) }
        }
    }
}

/// List available models. Returns JSON array of {id, name} objects.
pub fn list_models() -> Result<String, String> {
    let b = bridge()?;
    unsafe {
        let mut json_ptr: *mut c_char = std::ptr::null_mut();
        let mut err_ptr: *mut c_char = std::ptr::null_mut();
        let rc = (b.fn_list_models)(&mut json_ptr, &mut err_ptr);
        if rc != 0 {
            return Err(b.take_go_string(err_ptr));
        }
        Ok(b.take_go_string(json_ptr))
    }
}
