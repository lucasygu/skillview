use crate::process;
use crate::registry::{DashboardEntry, Registry};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct DashboardInfo {
    pub name: String,
    pub dashboard_dir: String,
    pub command: Option<Vec<String>>,
    pub port: Option<u16>,
    pub pid: Option<u32>,
    pub status: String,
    pub started_at: Option<String>,
    pub created_at: String,
}

impl From<&DashboardEntry> for DashboardInfo {
    fn from(entry: &DashboardEntry) -> Self {
        DashboardInfo {
            name: entry.name.clone(),
            dashboard_dir: entry.dashboard_dir.clone(),
            command: entry.command.clone(),
            port: entry.port,
            pid: entry.pid,
            status: process::status(entry).to_string(),
            started_at: entry.started_at.clone(),
            created_at: entry.created_at.clone(),
        }
    }
}

#[tauri::command]
pub fn list_dashboards() -> Vec<DashboardInfo> {
    let reg = Registry::load();
    reg.list().iter().map(|e| DashboardInfo::from(*e)).collect()
}

#[tauri::command]
pub fn start_dashboard(name: String) -> Result<DashboardInfo, String> {
    let mut reg = Registry::load();
    let entry = reg
        .get(&name)
        .ok_or_else(|| format!("dashboard '{}' not found", name))?
        .clone();

    let (pid, port) = process::start(&entry)?;

    let updated = DashboardEntry {
        pid: Some(pid),
        port: Some(port),
        started_at: Some(chrono::Utc::now().to_rfc3339()),
        ..entry
    };
    reg.set(updated.clone());

    Ok(DashboardInfo::from(&updated))
}

#[tauri::command]
pub fn stop_dashboard(name: String) -> Result<DashboardInfo, String> {
    let mut reg = Registry::load();
    let entry = reg
        .get(&name)
        .ok_or_else(|| format!("dashboard '{}' not found", name))?
        .clone();

    process::stop(&entry);

    let updated = DashboardEntry {
        pid: None,
        port: None,
        started_at: None,
        ..entry
    };
    reg.set(updated.clone());

    Ok(DashboardInfo::from(&updated))
}

#[tauri::command]
pub fn start_all_dashboards() -> Vec<DashboardInfo> {
    let mut reg = Registry::load();
    let names: Vec<String> = reg.dashboards.keys().cloned().collect();
    let mut results = Vec::new();

    for name in names {
        let entry = reg.dashboards.get(&name).unwrap().clone();
        if process::status(&entry) == "running" {
            results.push(DashboardInfo::from(&entry));
            continue;
        }

        match process::start(&entry) {
            Ok((pid, port)) => {
                let updated = DashboardEntry {
                    pid: Some(pid),
                    port: Some(port),
                    started_at: Some(chrono::Utc::now().to_rfc3339()),
                    ..entry
                };
                reg.set(updated.clone());
                results.push(DashboardInfo::from(&updated));
            }
            Err(_) => {
                results.push(DashboardInfo::from(&entry));
            }
        }
    }

    results
}

#[tauri::command]
pub fn register_dashboard(
    name: String,
    dir: String,
    command: Option<Vec<String>>,
) -> Result<DashboardInfo, String> {
    let resolved = if dir.starts_with('/') {
        dir
    } else {
        format!(
            "{}/{}",
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
            dir
        )
    };

    if !std::path::Path::new(&resolved).exists() {
        return Err(format!("directory does not exist: {}", resolved));
    }

    let entry = DashboardEntry {
        name: name.clone(),
        dashboard_dir: resolved,
        command,
        port: None,
        pid: None,
        started_at: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    let mut reg = Registry::load();
    reg.set(entry.clone());

    Ok(DashboardInfo::from(&entry))
}

#[tauri::command]
pub fn remove_dashboard(name: String) -> Result<bool, String> {
    let mut reg = Registry::load();
    if let Some(entry) = reg.get(&name) {
        process::stop(entry);
    }
    Ok(reg.remove(&name))
}
