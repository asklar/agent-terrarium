use crate::simulation::types::{Agent, ChatMessage};

/// Trait for agent response generation.
/// Currently uses a simple echo, but designed to be swapped for LLM-based responses.
#[allow(dead_code)]
pub trait AgentResponder: Send + Sync {
    fn respond(&self, agent: &Agent, message: &str, history: &[ChatMessage]) -> String;
}

#[allow(dead_code)]
pub struct EchoResponder;

impl AgentResponder for EchoResponder {
    fn respond(&self, agent: &Agent, message: &str, _history: &[ChatMessage]) -> String {
        format!("{} says: Echo - {}", agent.name, message)
    }
}
