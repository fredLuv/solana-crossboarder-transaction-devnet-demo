use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::message::Message;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::transaction::Transaction;
use solana_system_interface::instruction as system_instruction;
use std::collections::HashMap;

use crate::actions::utils::{get_param, lamports_to_sol, serialize_tx, sol_to_lamports};
use crate::consts::{DEFAULT_TIP_TO, LAMPORTS_PER_SIGNATURE, SOLANA_LOGO_URL};
use crate::error::AppError;
use crate::spec::{ActionGetResponse, ActionParameter, ActionPostResponse, LinkedAction};

struct CatalogItem {
    name: &'static str,
    price_sol: f64,
}

fn catalog_item(sku: &str) -> Option<CatalogItem> {
    match sku {
        "coffee" => Some(CatalogItem {
            name: "Drift Coffee",
            price_sol: 0.015,
        }),
        "sticker" => Some(CatalogItem {
            name: "Blink Sticker Pack",
            price_sol: 0.006,
        }),
        "hoodie" => Some(CatalogItem {
            name: "Validator Hoodie",
            price_sol: 0.08,
        }),
        _ => None,
    }
}

pub fn metadata() -> ActionGetResponse {
    ActionGetResponse::new(
        SOLANA_LOGO_URL,
        "Blink Shop Checkout",
        "Pick an item and quantity to generate a checkout transaction.",
        "Checkout",
    )
    .with_links(vec![LinkedAction {
        href: "/api/actions/checkout?sku={sku}&qty={qty}".into(),
        label: "Pay Shop".into(),
        parameters: Some(vec![
            ActionParameter::text("sku", "Item sku (coffee, sticker, hoodie)", true),
            ActionParameter::number("qty", "Quantity", true).with_min(1.0),
        ]),
    }])
}

pub async fn execute(
    rpc: &RpcClient,
    account: Pubkey,
    params: HashMap<String, String>,
) -> Result<ActionPostResponse, AppError> {
    let sku: String = get_param(&params, "sku")?;
    let qty: u64 = get_param(&params, "qty")?;

    if qty == 0 || qty > 20 {
        return Err(AppError::BadRequest(
            "Quantity must be between 1 and 20".into(),
        ));
    }

    let item = catalog_item(&sku)
        .ok_or_else(|| AppError::BadRequest("Unknown sku. Use coffee, sticker, or hoodie".into()))?;

    let amount_sol = item.price_sol * qty as f64;
    let lamports = sol_to_lamports(amount_sol);

    let recipient = DEFAULT_TIP_TO
        .parse::<Pubkey>()
        .map_err(|_| AppError::BadRequest("Invalid shop wallet pubkey".into()))?;

    let skip_balance_check = params
        .get("skip_balance_check")
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let blockhash = if skip_balance_check {
        rpc.get_latest_blockhash().await?
    } else {
        let (balance_res, blockhash_res) =
            tokio::join!(rpc.get_balance(&account), rpc.get_latest_blockhash());

        let balance = balance_res?;
        if balance < lamports + LAMPORTS_PER_SIGNATURE {
            return Err(AppError::BadRequest(format!(
                "Insufficient balance: you have {} SOL but need {} SOL + fees",
                lamports_to_sol(balance),
                amount_sol,
            )));
        }

        blockhash_res?
    };

    let ix = system_instruction::transfer(&account, &recipient, lamports);
    let msg = Message::new_with_blockhash(&[ix], Some(&account), &blockhash);
    let transaction = serialize_tx(&Transaction::new_unsigned(msg))?;

    Ok(ActionPostResponse {
        transaction,
        message: Some(format!(
            "Checkout ready: {} x {} ({} SOL) to shop wallet {}",
            qty, item.name, amount_sol, recipient
        )),
    })
}
