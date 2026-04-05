use base64::{engine::general_purpose::STANDARD, Engine};
use serde::de::DeserializeOwned;
use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_sdk::transaction::Transaction;
use std::collections::HashMap;

use crate::error::AppError;

pub fn get_param<T: DeserializeOwned + std::str::FromStr>(
    params: &HashMap<String, String>,
    key: &str,
) -> Result<T, AppError> {
    let raw = params
        .get(key)
        .ok_or_else(|| AppError::BadRequest(format!("Missing query parameter: {key}")))?;

    raw.parse::<T>()
        .map_err(|_| AppError::BadRequest(format!("Invalid query parameter: {key}")))
}

pub fn serialize_tx(tx: &Transaction) -> Result<String, AppError> {
    let bytes = bincode::serialize(tx)?;
    Ok(STANDARD.encode(bytes))
}

pub fn sol_to_lamports(sol: f64) -> u64 {
    (sol * LAMPORTS_PER_SOL as f64) as u64
}

pub fn lamports_to_sol(lamports: u64) -> f64 {
    lamports as f64 / LAMPORTS_PER_SOL as f64
}
