mod commands;
mod error;
mod process;
mod registry;

use commands::*;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Migrate old skill registry on first run
    registry::Registry::migrate_from_skill();

    // Load registry once into managed state
    let state = Mutex::new(registry::Registry::load());

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
