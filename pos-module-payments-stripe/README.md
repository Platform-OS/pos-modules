# Payments Stripe

Supports Stripe Checkout. Name of the gateway: `stripe`

## Installation

        pos-cli modules install payments_stripe

## Usage

Setup `stripe_sk_key` variable with your stripe secret key:
` function _ = 'modules/core/lib/commands/variable/set', name: 'stripe_sk_key', value: 'sk_test_...'`

Setup webhooks by running `function res = 'modules/payments_stripe/commands/setup'`

## Examples

### Stripe test card

- Card number: `4242 4242 4242 4242.`
- Use a valid future date, such as `12/34`.
- Use any three-digit CVC (four digits for American Express cards).
- Use any value you like for other form fields.

### Code examples

The form.

```
<section>
  <form action="/pay" method="POST">
    <div class="product">
      <img src="https://i.imgur.com/EHyR2nP.png" alt="The cover of Stubborn Attachments" />
      <div class="description">
        <h3>Stubborn Attachments</h3>
        <h5>$100.60</h5>
      </div>
      <input type="number" min="1" value="1" name="line_items[][quantity]" />
      <input type="hidden" name="line_items[][price_data][product_data][name]" value="Stubborn Attachments" />
      <input type="hidden" name="line_items[][price_data][unit_amount]" value="10060" />
      <input type="hidden" name="line_items[][price_data][currency]" value="USD" />
    </div>
    <button type="submit" id="checkout-button">Checkout</button>
  </form>
</section>
```

`pay.liquid`

```liquid
---
method: post
---
{% liquid
  assign total = 0
  for item in params.line_items
    assign line_price = item.price_data.unit_amount | times: item.quantity
    assign total = total | plus: line_price
  endfor


  assign ids = '["1", "2"]' | parse_json
  assign object = null | hash_merge: gateway: 'stripe', payable_ids: ids, amount_cents: total, currency: 'USD'
  function object = 'modules/payments/commands/transactions/create', object: object

  assign success_url = 'https://' | append: context.location.host | append: '/success/' | append: object.id
  assign failed_url = 'https://' | append: context.location.host | append: '/cancel/' | append: object.id
  assign stripe_params = null | hash_merge: success_url: success_url, cancel_url: failed_url, line_items: params.line_items
  function url = 'modules/payments/helpers/pay_url', transaction: object, gateway_params: stripe_params

  redirect_to url, status: 303
%}
```

`success.liquid`

```liquid
---
slug: success/:transaction_id
---
{% liquid
  function transaction = 'modules/payments/queries/transactions/find', id: context.params.transaction_id
%}
<h1>Your payment (#{{ transaction.id }}) was successful</h1>
<p>You payed {{ transaction.amount_cents |  pricify_cents }}.</p>
```

## TODO

- [x] run webhook setup `function res = 'modules/payments_stripe/commands/webhook_endpoints/create', stripe_event: 'checkout.session.completed', path: '/webhooks/checkout_session_completed', connect: false, host: context.location.host`, maybe we should put this code into migration so it will fail until you setup correct stripe key?
- [x] use new validations from `core` module
- [x] find solution for redirect url
- [x] implement things required by `payments` module, especially `modules/payments/commands/transactions/udpate_status`
- [x] add status to core
- [ ] handle failed or expired payment from stripe?
- [x] store api calls in gateway_requests, (checkout_session_create, incomming webhook). Maybe we don't need `schema/checkout_session` at all?
- [ ] test whole payment flow, do the payment with test card and wait for the webhook that will update transaction status.
- [x] refactor: create generic api call tempalate for stripe module and use it in checkout_session create and webhook create

## Versioning

```
git fetch origin --tags
npm version major | minor | patch
```
