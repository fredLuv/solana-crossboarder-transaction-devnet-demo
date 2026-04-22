use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{header, HeaderValue, Request};
use axum::middleware::{from_fn, Next};
use axum::response::Response;
use axum::routing::get;
use axum::{Json, Router};
use solana_client::nonblocking::rpc_client::RpcClient;
use std::collections::HashMap;
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};

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
    let allowed_origins = std::env::var("ALLOWED_ORIGINS")
        .unwrap_or_else(|_| {
            "http://127.0.0.1:4174,http://localhost:4174,http://127.0.0.1:5173,http://localhost:5173"
                .into()
        })
        .split(',')
        .filter_map(|origin| origin.trim().parse::<HeaderValue>().ok())
        .collect::<Vec<_>>();

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
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
        .layer(from_fn(security_headers))
        .with_state(state)
}

async fn security_headers(request: Request<Body>, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"),
    );
    headers.insert(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    headers.insert("cross-origin-resource-policy", HeaderValue::from_static("same-origin"));
    headers.insert(
        "permissions-policy",
        HeaderValue::from_static("camera=(), microphone=(), geolocation=(), payment=()"),
    );
    headers.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
    response
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
