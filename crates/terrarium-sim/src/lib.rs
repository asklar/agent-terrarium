//! Terrarium Simulation Engine
//!
//! Core simulation for Agent Terrarium - renderer agnostic.
//! This crate provides the physics, movement, and interaction logic
//! for agents living in a terrarium world.

pub mod types;
pub mod world;

pub use types::*;
pub use world::World;
