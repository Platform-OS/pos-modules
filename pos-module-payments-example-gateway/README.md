# Payments Example Gateway

Module implements fake payment gateway. It does not process any money. It should be used for testing purpose. You can simulate success or failed payment.
Name of the gateway: `example_gateway`

## Installation

        pos-cli modules install payments_example_gateway

## Usage

After you install module you can use `payments` module with `example_gateway` gateway type.

## Examples

Code examples

``` liquid
EXAMPLE GATEWAY
{% liquid
  if context.params.example_pay
    assign ids = '["1", "2"]' | parse_json
    assign object = null | hash_merge: gateway: 'example_gateway', payable_ids: ids, amount_cents: 1001, currency: 'USD'
    function object = 'modules/payments/commands/transactions/create', object: object
    log object, type: 'object'
    assign gateway_params = null | hash_merge: success_url: '/success', cancel_url: '/failed'
    function url = 'modules/payments/helpers/pay_url', transaction: object, gateway_params: gateway_params
    log url, type: 'url'
    redirect_to url, status: 303
  endif
%}
<form action="/debug?example_pay=1" method="GET">
  <input type='hidden' name="example_pay" value="1">
  <button type="submit" id="checkout-button">Checkout</button>
</form>
```

## Testing

This module includes E2E tests using Playwright.

### Running Tests

```bash
npm run pw-tests
```

### Test Coverage

The test suite includes:
- Payment page loading
- Successful payment flows
- Failed payment flows
- Delayed payment processing
- Invalid transaction handling
- Multiple payment attempts
- URL parameter preservation

For more details, see [Test README](tests/README.md).

## TODO

- [ ] do the page that similate external api
- [ ] do the requests to external api and store those requests in gateway requests

## Versioning

```
git fetch origin --tags
npm version major | minor | patch
```

