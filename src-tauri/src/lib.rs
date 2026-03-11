mod commands;
mod process;
mod registry;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Migrate old skill registry on first run
    registry::Registry::migrate_from_skill();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_dashboards,
            start_dashboard,
            stop_dashboard,
            start_all_dashboards,
            register_dashboard,
            remove_dashboard,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
