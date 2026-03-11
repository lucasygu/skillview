use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardEntry {
    pub name: String,
    pub dashboard_dir: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Registry {
    pub dashboards: HashMap<String, DashboardEntry>,
}

impl Registry {
    fn path() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join(".skillview").join("registry.json")
    }

    pub fn load() -> Self {
        let path = Self::path();
        if !path.exists() {
            return Registry {
                dashboards: HashMap::new(),
            };
        }
        let data = fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&data).unwrap_or(Registry {
            dashboards: HashMap::new(),
        })
    }

    pub fn save(&self) {
        let path = Self::path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).ok();
        }
        let data = serde_json::to_string_pretty(self).unwrap_or_default();
        fs::write(&path, data).ok();
    }

    pub fn get(&self, name: &str) -> Option<&DashboardEntry> {
        self.dashboards.get(name)
    }

    pub fn set(&mut self, entry: DashboardEntry) {
        self.dashboards.insert(entry.name.clone(), entry);
        self.save();
    }

    pub fn remove(&mut self, name: &str) -> bool {
        let removed = self.dashboards.remove(name).is_some();
        if removed {
            self.save();
        }
        removed
    }

    pub fn list(&self) -> Vec<&DashboardEntry> {
        self.dashboards.values().collect()
    }

    /// Migrate from old skill registry if it exists and ours is empty
    pub fn migrate_from_skill() {
        let new_path = Self::path();
        if new_path.exists() {
            return;
        }

        let home = std::env::var("HOME").unwrap_or_default();
        let old_path = PathBuf::from(&home)
            .join(".claude")
            .join("skills")
            .join("dashboard")
            .join("data")
            .join("registry.json");

        if !old_path.exists() {
            return;
        }

        if let Ok(data) = fs::read_to_string(&old_path) {
            // Old format has same structure, just missing port field
            if let Ok(mut reg) = serde_json::from_str::<Registry>(&data) {
                // Clear PIDs since they're stale
                for entry in reg.dashboards.values_mut() {
                    entry.pid = None;
                    entry.started_at = None;
                    entry.port = None;
                }
                reg.save();
            }
        }
    }
}
