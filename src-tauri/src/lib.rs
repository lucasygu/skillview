mod commands;
mod error;
mod process;
mod registry;

use commands::*;
use std::sync::Mutex;
use tauri::Manager;

/// macOS GUI apps don't inherit the user's shell PATH.
/// Run login shell to capture the real PATH so child processes
/// can find tools like `bun`, `distro`, `node`, etc.
fn fix_path_env() {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    if let Ok(output) = std::process::Command::new(&shell)
        .args(["-l", "-c", "echo $PATH"])
        .output()
    {
        if let Ok(path) = String::from_utf8(output.stdout) {
            let path = path.trim();
            if !path.is_empty() {
                std::env::set_var("PATH", path);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    fix_path_env();

    // Migrate old skill registry on first run
    registry::Registry::migrate_from_skill();

    // Load registry and kill any stale processes from a previous crash
    let state = {
        let mut reg = registry::Registry::load();
        for entry in reg.dashboards.values() {
            process::stop(entry);
        }
        for entry in reg.dashboards.values_mut() {
            entry.pid = None;
            entry.port = None;
            entry.started_at = None;
        }
        reg.save();
        Mutex::new(reg)
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            list_dashboards,
            start_dashboard,
            stop_dashboard,
            start_all_dashboards,
            register_dashboard,
            remove_dashboard,
        ])
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Stop all child processes on exit
                let state = app_handle.state::<Mutex<registry::Registry>>();
                let mut reg = match state.lock() {
                    Ok(r) => r,
                    Err(_) => return,
                };
                let names: Vec<String> = reg.dashboards.keys().cloned().collect();
                for name in &names {
                    if let Some(entry) = reg.dashboards.get(name) {
                        process::stop(entry);
                    }
                }
                // Clear runtime state and save
                for name in &names {
                    if let Some(entry) = reg.dashboards.get_mut(name) {
                        entry.pid = None;
                        entry.port = None;
                        entry.started_at = None;
                    }
                }
                reg.save();
            }
        });
}
