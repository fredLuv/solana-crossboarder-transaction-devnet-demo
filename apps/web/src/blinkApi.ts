import { appConfig } from "./config";

export type BlinkActionsManifest = {
  rules: Array<{
    pathPattern: string;
    apiPath: string;
  }>;
};

export type BlinkActionMetadata = {
  icon: string;
  title: string;
  description: string;
  label: string;
  links?: {
    actions: Array<{
      href: string;
      label: string;
      parameters?: Array<{
        name: string;
        label?: string;
        required?: boolean;
        type?: "text" | "number";
        min?: number;
      }>;
    }>;
  };
};

export type BlinkActionPostResponse = {
  transaction: string;
  message?: string;
};

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${appConfig.blinkApiBaseUrl}${path}`, options);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Blink API failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export function fetchBlinkActionsManifest() {
  return requestJson<BlinkActionsManifest>("/actions.json");
}

export function fetchBlinkCheckoutMetadata() {
  return requestJson<BlinkActionMetadata>("/api/actions/checkout");
}

export function postBlinkCheckoutAction(params: {
  sku: string;
  qty: number;
  account: string;
  skipBalanceCheck?: boolean;
}) {
  const search = new URLSearchParams({
    sku: params.sku,
    qty: String(params.qty)
  });

  if (params.skipBalanceCheck) {
    search.set("skip_balance_check", "true");
  }

  return requestJson<BlinkActionPostResponse>(`/api/actions/checkout?${search.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ account: params.account })
  });
}
