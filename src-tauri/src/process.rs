use crate::error::AppError;
use crate::registry::DashboardEntry;
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
        _ => "stopped",
    }
}

/// Start a dashboard server, returns (pid, port)
pub fn start(entry: &DashboardEntry) -> Result<(u32, u16), AppError> {
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
            return Err(AppError::EmptyCommand);
        }
        let (bin, args) = cmd.split_first().unwrap();
        Command::new(bin)
            .args(args)
            .current_dir(dir)
            .env("PORT", port.to_string())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| AppError::SpawnFailed(format!("{}: {}", bin, e)))?
    } else {
        let server_file = Path::new(dir).join("server.tsx");
        if !server_file.exists() {
            return Err(AppError::NoServerFile(dir.to_string()));
        }

        // Install deps if needed
        let node_modules = Path::new(dir).join("node_modules");
        if !node_modules.exists() {
            if let Err(e) = Command::new("bun")
                .args(["install"])
                .current_dir(dir)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
            {
                log::warn!("bun install failed: {}", e);
            }
        }

        Command::new("bun")
            .args(["run", &server_file.to_string_lossy()])
            .current_dir(dir)
            .env("PORT", port.to_string())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| AppError::SpawnFailed(format!("bun: {}", e)))?
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
