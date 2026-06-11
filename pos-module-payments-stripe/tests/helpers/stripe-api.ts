import { APIRequestContext } from '@playwright/test';
import crypto from 'crypto';

/**
 * Get GraphQL headers with authentication
 */
function getGraphQLHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const apiToken = process.env.MPKIT_TOKEN;
  if (apiToken) {
    headers['Authorization'] = `Token ${apiToken}`;
  }

  return headers;
}

/**
 * Handle GraphQL response with error checking
 */
async function handleGraphQLResponse(response: any) {
  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`GraphQL request failed (${response.status()}): ${text.substring(0, 500)}`);
  }

  const json = await response.json();

  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json;
}

/**
 * Generate HMAC-SHA256 webhook signature for Stripe webhooks
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp: number
): string {
  const signedPayload = `${timestamp}.${payload}`;
  return crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
}

export function getRequiredBaseURL(): string {
  const baseURL = process.env.MPKIT_URL;
  if (!baseURL) {
    throw new Error('MPKIT_URL must be set to run Stripe API tests.');
  }

  return baseURL;
}

export function getHostFromBaseURL(baseURL: string): string {
  return new URL(baseURL).host;
}

/**
 * Send a signed webhook to a Stripe webhook endpoint
 */
export async function sendWebhook(
  request: APIRequestContext,
  baseURL: string,
  event: any,
  webhookSecret: string,
  endpoint: string = '/payments/stripe/webhooks'
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify(event);
  const signature = generateWebhookSignature(payload, webhookSecret, timestamp);

  return await request.post(`${baseURL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': `t=${timestamp},v1=${signature}`,
    },
    data: payload,
  });
}

/**
 * Create a webhook_endpoint record via GraphQL
 */
export async function createWebhookEndpoint(
  request: APIRequestContext,
  baseURL: string,
  data: {
    url: string;
    secret: string;
    livemode?: boolean;
    stripe_account_name?: string;
  }
) {
  const properties: string[] = [
    `{ name: "url", value: "${data.url.replace(/"/g, '\\"')}" }`,
    `{ name: "secret", value: "${data.secret.replace(/"/g, '\\"')}" }`,
    `{ name: "livemode", value_boolean: ${data.livemode ?? false} }`,
  ];

  if (data.stripe_account_name) {
    properties.push(`{ name: "stripe_account_name", value: "${data.stripe_account_name.replace(/"/g, '\\"')}" }`);
  }

  const mutation = `
    mutation {
      record_create(
        record: {
          table: "modules/payments_stripe/webhook_endpoint"
          properties: [
            ${properties.join(',\n            ')}
          ]
        }
      ) {
        id
        properties
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query: mutation },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.record_create;
}

/**
 * Create a transaction via GraphQL
 */
export async function createTransaction(
  request: APIRequestContext,
  baseURL: string,
  data: {
    gateway: string;
    amount_cents: number;
    currency: string;
    status?: string;
    gateway_transaction_id?: string;
    stripe_account_name?: string;
  }
) {
  const properties: string[] = [
    `{ name: "gateway", value: "${data.gateway}" }`,
    `{ name: "amount_cents", value_int: ${data.amount_cents} }`,
    `{ name: "currency", value: "${data.currency}" }`,
    `{ name: "c__status", value: "${data.status || 'pending'}" }`,
  ];

  if (data.gateway_transaction_id) {
    properties.push(`{ name: "gateway_transaction_id", value: "${data.gateway_transaction_id.replace(/"/g, '\\"')}" }`);
  }

  if (data.stripe_account_name) {
    properties.push(`{ name: "stripe_account_name", value: "${data.stripe_account_name.replace(/"/g, '\\"')}" }`);
  }

  const mutation = `
    mutation {
      record_create(
        record: {
          table: "modules/payments/transaction"
          properties: [
            ${properties.join(',\n            ')}
          ]
        }
      ) {
        id
        properties
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query: mutation },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.record_create;
}

/**
 * Query a transaction by ID
 */
export async function queryTransaction(
  request: APIRequestContext,
  baseURL: string,
  transactionId: string
) {
  const query = `
    query {
      records(
        per_page: 1
        filter: {
          table: { value: "modules/payments/transaction" }
          id: { value: "${transactionId}" }
        }
      ) {
        results {
          id
          properties
        }
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.records.results[0];
}

/**
 * Update a transaction via GraphQL
 */
export async function updateTransaction(
  request: APIRequestContext,
  baseURL: string,
  transactionId: string,
  updates: {
    status?: string;
    gateway_transaction_id?: string;
  }
) {
  const properties: string[] = [];

  if (updates.status) {
    properties.push(`{ name: "c__status", value: "${updates.status}" }`);
  }

  if (updates.gateway_transaction_id) {
    properties.push(`{ name: "gateway_transaction_id", value: "${updates.gateway_transaction_id.replace(/"/g, '\\"')}" }`);
  }

  const mutation = `
    mutation {
      record_update(
        id: "${transactionId}"
        record: {
          table: "modules/payments/transaction"
          properties: [
            ${properties.join(',\n            ')}
          ]
        }
      ) {
        id
        properties
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query: mutation },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.record_update;
}

/**
 * Create a setup_intent record via GraphQL
 */
export async function createSetupIntent(
  request: APIRequestContext,
  baseURL: string,
  data: {
    gateway_id: string;
    reference_id: string;
    status?: string;
  }
) {
  const mutation = `
    mutation {
      record_create(
        record: {
          table: "modules/payments_stripe/setup_intent"
          properties: [
            { name: "gateway_id", value: "${data.gateway_id.replace(/"/g, '\\"')}" }
            { name: "reference_id", value: "${data.reference_id.replace(/"/g, '\\"')}" }
            { name: "c__status", value: "${data.status || 'pending'}" }
          ]
        }
      ) {
        id
        properties
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query: mutation },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.record_create;
}

/**
 * Create a connected_account record via GraphQL
 */
export async function createConnectedAccount(
  request: APIRequestContext,
  baseURL: string,
  data: {
    account_id: string;
    reference_id: string;
    stripe_account_name?: string;
  }
) {
  const properties: string[] = [
    `{ name: "account_id", value: "${data.account_id.replace(/"/g, '\\"')}" }`,
    `{ name: "reference_id", value: "${data.reference_id.replace(/"/g, '\\"')}" }`,
  ];

  if (data.stripe_account_name) {
    properties.push(`{ name: "stripe_account_name", value: "${data.stripe_account_name.replace(/"/g, '\\"')}" }`);
  }

  const mutation = `
    mutation {
      record_create(
        record: {
          table: "modules/payments_stripe/connected_account"
          properties: [
            ${properties.join(',\n            ')}
          ]
        }
      ) {
        id
        properties
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query: mutation },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.record_create;
}

/**
 * Delete a record by ID (for cleanup)
 */
export async function deleteRecord(
  request: APIRequestContext,
  baseURL: string,
  recordId: string,
  table: string
) {
  const mutation = `
    mutation {
      record_delete(
        id: "${recordId}"
        table: "${table}"
      ) {
        id
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query: mutation },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.record_delete;
}

/**
 * Helper to extract property value from platformOS record
 */
export function getProperty(record: any, propertyName: string): any {
  if (!record) {
    return null;
  }

  // Handle case where properties is not defined
  if (!record.properties) {
    return null;
  }

  // Properties can be either an object or an array depending on the query
  if (Array.isArray(record.properties)) {
    // Array format: [{ name: "field", value: "value" }]
    const prop = record.properties.find((p: any) => p.name === propertyName);
    return prop ? (prop.value ?? prop.value_int ?? prop.value_boolean ?? null) : null;
  } else {
    // Object format: { field: "value" }
    return record.properties[propertyName] ?? null;
  }
}

/**
 * Create a Stripe charge.succeeded event payload
 */
export function createChargeSucceededEvent(data: {
  chargeId: string;
  transactionId: string;
  host: string;
  amount?: number;
  currency?: string;
}) {
  return {
    id: `evt_${Date.now()}`,
    type: 'charge.succeeded',
    data: {
      object: {
        id: data.chargeId,
        object: 'charge',
        status: 'succeeded',
        amount: data.amount || 10000,
        currency: data.currency || 'usd',
        metadata: {
          transaction_id: data.transactionId,
          host: data.host,
        },
      },
    },
  };
}

/**
 * Create a Stripe checkout.session.completed event payload
 */
export function createCheckoutCompletedEvent(data: {
  sessionId: string;
  transactionId: string;
  host: string;
  paymentStatus?: string;
}) {
  return {
    id: `evt_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: data.sessionId,
        object: 'checkout.session',
        payment_status: data.paymentStatus || 'paid',
        client_reference_id: data.transactionId,
        success_url: `https://${data.host}/payment/success?transaction_id=${data.transactionId}`,
        customer: `cus_${Date.now()}`,
        payment_method: `pm_${Date.now()}`,
        metadata: {
          transaction_id: data.transactionId,
        },
      },
    },
  };
}

/**
 * Create a Stripe setup_intent.succeeded event payload
 */
export function createSetupIntentSucceededEvent(data: {
  setupIntentId: string;
  paymentMethodId: string;
  customerId: string;
}) {
  return {
    id: `evt_${Date.now()}`,
    type: 'setup_intent.succeeded',
    data: {
      object: {
        id: data.setupIntentId,
        object: 'setup_intent',
        status: 'succeeded',
        payment_method: data.paymentMethodId,
        customer: data.customerId,
      },
    },
  };
}

/**
 * Create a Stripe payout.paid event payload
 */
export function createPayoutPaidEvent(data: {
  payoutId: string;
  accountId: string;
  amount: number;
  currency?: string;
}) {
  return {
    id: `evt_${Date.now()}`,
    type: 'payout.paid',
    data: {
      object: {
        id: data.payoutId,
        object: 'payout',
        amount: data.amount,
        currency: data.currency || 'usd',
        arrival_date: Math.floor(Date.now() / 1000) + 86400,
        status: 'paid',
      },
    },
    account: data.accountId,
  };
}

/**
 * Create a Stripe account.updated event payload
 */
export function createAccountUpdatedEvent(data: {
  accountId: string;
  payoutsEnabled?: boolean;
  chargesEnabled?: boolean;
  disabledReason?: string;
}) {
  return {
    id: `evt_${Date.now()}`,
    type: 'account.updated',
    account: data.accountId,
    data: {
      object: {
        id: data.accountId,
        object: 'account',
        payouts_enabled: data.payoutsEnabled ?? false,
        charges_enabled: data.chargesEnabled ?? false,
        requirements: {
          disabled_reason: data.disabledReason || null,
        },
      },
    },
  };
}

/**
 * Query a payout record by Stripe payout_id
 */
export async function queryPayoutByPayoutId(
  request: APIRequestContext,
  baseURL: string,
  payoutId: string
) {
  const query = `
    query {
      records(
        per_page: 1
        filter: {
          table: { value: "modules/payments_stripe/payout" }
          properties: [{ name: "payout_id", value: "${payoutId}" }]
        }
      ) {
        results {
          id
          payout_id: property(name: "payout_id")
          amount_cents: property_int(name: "amount_cents")
          currency: property(name: "currency")
          state: property(name: "state")
          connected_account_id: property(name: "connected_account_id")
          gateway_connected_account_id: property(name: "gateway_connected_account_id")
        }
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.records.results[0] || null;
}

/**
 * Query a connected_account record by Stripe account_id
 */
export async function queryConnectedAccountByAccountId(
  request: APIRequestContext,
  baseURL: string,
  accountId: string
) {
  const query = `
    query {
      records(
        per_page: 1
        filter: {
          table: { value: "modules/payments_stripe/connected_account" }
          properties: [{ name: "account_id", value: "${accountId}" }]
        }
      ) {
        results {
          id
          account_id: property(name: "account_id")
          state: property(name: "state")
          reference_id: property(name: "reference_id")
        }
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.records.results[0] || null;
}

export async function querySetupIntentByGatewayId(
  request: APIRequestContext,
  baseURL: string,
  gatewayId: string
) {
  const query = `
    query {
      records(
        per_page: 1
        filter: {
          table: { value: "modules/payments_stripe/setup_intent" }
          properties: [{ name: "gateway_id", value: "${gatewayId}" }]
        }
      ) {
        results {
          id
          gateway_id: property(name: "gateway_id")
          reference_id: property(name: "reference_id")
          status: property(name: "c__status")
          payment_method_id: property(name: "payment_method_id")
        }
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.records.results[0] || null;
}

export async function queryCustomerByCustomerId(
  request: APIRequestContext,
  baseURL: string,
  customerId: string
) {
  const query = `
    query {
      records(
        per_page: 1
        filter: {
          table: { value: "modules/payments_stripe/customer" }
          properties: [{ name: "customer_id", value: "${customerId}" }]
        }
      ) {
        results {
          id
          customer_id: property(name: "customer_id")
          reference_id: property(name: "reference_id")
          email: property(name: "email")
          name: property(name: "name")
        }
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.records.results[0] || null;
}

export async function queryPaymentMethodByPaymentMethodId(
  request: APIRequestContext,
  baseURL: string,
  paymentMethodId: string
) {
  const query = `
    query {
      records(
        per_page: 1
        filter: {
          table: { value: "modules/payments_stripe/payment_method" }
          properties: [{ name: "payment_method_id", value: "${paymentMethodId}" }]
        }
      ) {
        results {
          id
          payment_method_id: property(name: "payment_method_id")
          customer_id: property(name: "customer_id")
          reference_id: property(name: "reference_id")
        }
      }
    }
  `;

  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: { query },
  });

  const json = await handleGraphQLResponse(response);
  return json.data.records.results[0] || null;
}
