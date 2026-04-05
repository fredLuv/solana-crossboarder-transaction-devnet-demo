use axum::extract::{Query, State};
use axum::http::header;
use axum::routing::get;
use axum::{Json, Router};
use solana_client::nonblocking::rpc_client::RpcClient;
use std::collections::HashMap;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

use crate::actions::{checkout, tip};
use crate::error::AppError;
use crate::spec::{
    ActionGetResponse, ActionPostRequest, ActionPostResponse, ActionRule, ActionsJson,
};

pub struct AppState {
    pub rpc: Arc<RpcClient>,
}

pub fn build_router(rpc: Arc<RpcClient>) -> Router {
    let state = Arc::new(AppState { rpc });

    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods(tower_http::cors::Any)
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::CONTENT_ENCODING,
            header::ACCEPT_ENCODING,
        ]);

    Router::new()
        .route("/actions.json", get(get_actions_json))
        .route("/api/actions/checkout", get(get_checkout).post(post_checkout))
        .route("/api/actions/tip", get(get_tip).post(post_tip))
        .layer(cors)
        .with_state(state)
}

async fn get_actions_json() -> Json<ActionsJson> {
    Json(ActionsJson {
        rules: vec![
            ActionRule {
                path_pattern: "/shop/*".to_string(),
                api_path: "/api/actions/checkout".to_string(),
            },
            ActionRule {
                path_pattern: "/*".to_string(),
                api_path: "/api/actions/tip".to_string(),
            },
        ],
    })
}

async fn get_tip() -> Json<ActionGetResponse> {
    Json(tip::metadata())
}

async fn get_checkout() -> Json<ActionGetResponse> {
    Json(checkout::metadata())
}

async fn post_tip(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
    Json(body): Json<ActionPostRequest>,
) -> Result<Json<ActionPostResponse>, AppError> {
    let account = body
        .account
        .parse()
        .map_err(|_| AppError::BadRequest("Invalid account pubkey".into()))?;

    let response = tip::execute(&state.rpc, account, params).await?;
    Ok(Json(response))
}

async fn post_checkout(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
    Json(body): Json<ActionPostRequest>,
) -> Result<Json<ActionPostResponse>, AppError> {
    let account = body
        .account
        .parse()
        .map_err(|_| AppError::BadRequest("Invalid account pubkey".into()))?;

    let response = checkout::execute(&state.rpc, account, params).await?;
    Ok(Json(response))
}
