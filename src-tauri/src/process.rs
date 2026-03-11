use crate::registry::{DashboardEntry, Registry};
use std::net::TcpListener;
use std::path::Path;
use std::process::Command;

/// Find a free TCP port by binding to port 0
pub fn find_free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("failed to bind to port 0");
    listener.local_addr().unwrap().port()
}

/// Check if a process is alive by sending signal 0
pub fn is_alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

/// Get dashboard status
pub fn status(entry: &DashboardEntry) -> &'static str {
    match entry.pid {
        Some(pid) if is_alive(pid) => "running",
        Some(_) => "stopped", // stale PID
        None => "stopped",
    }
}

/// Start a dashboard server, returns (pid, port)
pub fn start(entry: &DashboardEntry) -> Result<(u32, u16), String> {
    // Already running?
    if let Some(pid) = entry.pid {
        if is_alive(pid) {
            return Ok((pid, entry.port.unwrap_or(0)));
        }
    }

    let port = find_free_port();
    let dir = &entry.dashboard_dir;

    let child = if let Some(ref cmd) = entry.command {
        if cmd.is_empty() {
            return Err("empty custom command".to_string());
        }
        let (bin, args) = cmd.split_first().unwrap();
        Command::new(bin)
            .args(args)
            .current_dir(dir)
            .env("PORT", port.to_string())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("failed to spawn {}: {}", bin, e))?
    } else {
        // Default: bun run server.tsx
        let server_file = Path::new(dir).join("server.tsx");
        if !server_file.exists() {
            return Err(format!("no server.tsx found in {}", dir));
        }

        // Install deps if needed
        let node_modules = Path::new(dir).join("node_modules");
        if !node_modules.exists() {
            Command::new("bun")
                .args(["install"])
                .current_dir(dir)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .ok();
        }

        Command::new("bun")
            .args(["run", &server_file.to_string_lossy()])
            .current_dir(dir)
            .env("PORT", port.to_string())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("failed to spawn bun: {}", e))?
    };

    let pid = child.id();
    Ok((pid, port))
}

/// Stop a dashboard by PID
pub fn stop(entry: &DashboardEntry) -> bool {
    if let Some(pid) = entry.pid {
        if is_alive(pid) {
            unsafe {
                libc::kill(pid as i32, libc::SIGTERM);
            }
            return true;
        }
    }
    false
}

/// Stop all running dashboards
#[allow(dead_code)]
pub fn stop_all(registry: &mut Registry) {
    let names: Vec<String> = registry.dashboards.keys().cloned().collect();
    for name in names {
        if let Some(entry) = registry.dashboards.get(&name) {
            stop(entry);
        }
        if let Some(entry) = registry.dashboards.get_mut(&name) {
            entry.pid = None;
            entry.port = None;
            entry.started_at = None;
        }
    }
    registry.save();
}
