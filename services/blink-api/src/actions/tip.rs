use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::message::Message;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::transaction::Transaction;
use solana_system_interface::instruction as system_instruction;
use std::collections::HashMap;

use crate::actions::utils::{get_param, lamports_to_sol, serialize_tx, sol_to_lamports};
use crate::consts::{DEFAULT_TIP_TO, LAMPORTS_PER_SIGNATURE, SOLANA_LOGO_URL};
use crate::error::AppError;
use crate::spec::{
    ActionGetResponse, ActionParameter, ActionPostResponse, LinkedAction,
};

pub fn metadata() -> ActionGetResponse {
    ActionGetResponse::new(
        SOLANA_LOGO_URL,
        "Buy Me a Coffee (Blink MVP)",
        "Send a small SOL tip to demo a Solana Blink action.",
        "Tip",
    )
    .with_links(vec![LinkedAction {
        href: format!("/api/actions/tip?to={{to}}&amount={{amount}}"),
        label: "Send Tip".into(),
        parameters: Some(vec![
            ActionParameter::text("to", "Recipient pubkey", true),
            ActionParameter::number("amount", "Amount (SOL)", true).with_min(0.001),
        ]),
    }])
}

pub async fn execute(
    rpc: &RpcClient,
    account: Pubkey,
    params: HashMap<String, String>,
) -> Result<ActionPostResponse, AppError> {
    let recipient = params
        .get("to")
        .cloned()
        .unwrap_or_else(|| DEFAULT_TIP_TO.to_string())
        .parse::<Pubkey>()
        .map_err(|_| AppError::BadRequest("Invalid recipient pubkey".into()))?;

    let amount_sol: f64 = if params.contains_key("amount") {
        get_param(&params, "amount")?
    } else {
        0.01
    };

    if amount_sol < 0.001 {
        return Err(AppError::BadRequest(
            "Amount must be at least 0.001 SOL".into(),
        ));
    }

    let skip_balance_check = params
        .get("skip_balance_check")
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let lamports = sol_to_lamports(amount_sol);
    let blockhash = if skip_balance_check {
        rpc.get_latest_blockhash().await?
    } else {
        let (balance_res, blockhash_res) = tokio::join!(rpc.get_balance(&account), rpc.get_latest_blockhash(),);

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
        message: Some(format!("Tip {amount_sol} SOL to {recipient}")),
    })
}
