use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),

    #[error("RPC error: {0}")]
    Rpc(#[from] solana_client::client_error::ClientError),

    #[error("Serialization error: {0}")]
    Serialization(#[from] bincode::Error),
}

#[derive(Serialize)]
struct ErrorBody {
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match self {
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Rpc(_) | AppError::Serialization(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let body = Json(ErrorBody {
            message: self.to_string(),
        });

        (status, body).into_response()
    }
}
