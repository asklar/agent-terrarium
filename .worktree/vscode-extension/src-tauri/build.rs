use std::path::PathBuf;
use std::process::Command;

fn main() {
    build_copilot_bridge();
    tauri_build::build()
}

/// Build the Go copilot-bridge DLL and copy it next to the Rust binary.
fn build_copilot_bridge() {
    let bridge_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("copilot-bridge");
    let src = bridge_dir.join("main.go");
    if !src.exists() {
        println!("cargo:warning=copilot-bridge/main.go not found, skipping Go bridge build");
        return;
    }

    // Determine output name per platform
    let (dll_name, lib_ext) = if cfg!(target_os = "windows") {
        ("copilot_bridge.dll", "dll")
    } else if cfg!(target_os = "macos") {
        ("copilot_bridge.dylib", "dylib")
    } else {
        ("copilot_bridge.so", "so")
    };

    let dll_path = bridge_dir.join(dll_name);

    // Rebuild only if source changed
    println!("cargo:rerun-if-changed=copilot-bridge/main.go");
    println!("cargo:rerun-if-changed=copilot-bridge/go.mod");
    println!("cargo:rerun-if-changed=copilot-bridge/go.sum");

    // Skip build if DLL already exists and is newer than source
    if dll_path.exists() {
        if let (Ok(dll_meta), Ok(src_meta)) = (dll_path.metadata(), src.metadata()) {
            if let (Ok(dll_time), Ok(src_time)) = (dll_meta.modified(), src_meta.modified()) {
                if dll_time > src_time {
                    copy_dll_to_target(&dll_path, dll_name);
                    return;
                }
            }
        }
    }

    // Check if Go is available
    let go_check = Command::new("go").arg("version").output();
    if go_check.is_err() || !go_check.unwrap().status.success() {
        if dll_path.exists() {
            println!("cargo:warning=Go not found, using existing {}", dll_name);
            copy_dll_to_target(&dll_path, dll_name);
        } else {
            println!("cargo:warning=Go not found and no pre-built {}. Copilot backend will not work.", dll_name);
        }
        return;
    }

    println!("cargo:warning=Building copilot-bridge ({})...", lib_ext);

    let status = Command::new("go")
        .args(["build", "-buildmode=c-shared", "-o", dll_name, "."])
        .current_dir(&bridge_dir)
        .env("CGO_ENABLED", "1")
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("cargo:warning=copilot-bridge built successfully");
            copy_dll_to_target(&dll_path, dll_name);
        }
        Ok(s) => {
            println!("cargo:warning=copilot-bridge build failed (exit {}). Copilot backend may not work.", s);
            // Don't fail the entire build — the app works without the Copilot backend
        }
        Err(e) => {
            println!("cargo:warning=Failed to run `go build`: {}. Copilot backend may not work.", e);
        }
    }
}

/// Copy the built DLL to the Cargo target directory so it's next to the executable.
fn copy_dll_to_target(dll_path: &PathBuf, dll_name: &str) {
    // OUT_DIR is like target/debug/build/<crate>/out — go up 3 levels to target/debug/
    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        let target_dir = PathBuf::from(&out_dir)
            .ancestors()
            .nth(3)
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from(&out_dir));
        let dest = target_dir.join(dll_name);
        if let Err(e) = std::fs::copy(dll_path, &dest) {
            println!("cargo:warning=Failed to copy {} to {:?}: {}", dll_name, dest, e);
        }
    }
}
