use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("dashboard '{0}' not found")]
    NotFound(String),

    #[error("directory does not exist: {0}")]
    DirNotFound(String),

    #[error("failed to spawn process: {0}")]
    SpawnFailed(String),

    #[error("no server.tsx found in {0}")]
    NoServerFile(String),

    #[error("empty custom command")]
    EmptyCommand,

    #[error("lock poisoned")]
    LockPoisoned,

    #[error("{0}")]
    Io(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

// Tauri requires Serialize for command error types
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
