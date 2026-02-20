use std::collections::HashMap;
use std::sync::Arc;

use super::backend::AgentBackend;

pub struct BackendRegistry {
    backends: HashMap<String, Arc<dyn AgentBackend>>,
}

impl BackendRegistry {
    pub fn new() -> Self {
        Self {
            backends: HashMap::new(),
        }
    }

    pub fn register(&mut self, backend: Arc<dyn AgentBackend>) {
        log::info!("Registered backend: {} ({})", backend.id(), backend.display_name());
        self.backends.insert(backend.id().to_string(), backend);
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn AgentBackend>> {
        self.backends.get(id).cloned()
    }

    #[allow(dead_code)]
    pub fn list(&self) -> Vec<(&str, &str)> {
        self.backends
            .values()
            .map(|b| (b.id(), b.display_name()))
            .collect()
    }
}
