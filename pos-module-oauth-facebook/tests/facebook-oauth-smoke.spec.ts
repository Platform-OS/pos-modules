import { test, expect } from '@playwright/test';

test.describe('Facebook OAuth module', () => {
  test('builds a Facebook authorization redirect URL', async ({ request, baseURL }) => {
    expect(baseURL, 'MPKIT_URL must be set to run Facebook OAuth tests.').toBeTruthy();

    const response = await request.get('/test/oauth-facebook/redirect-url', {
      params: {
        client_id: 'test-client-id',
        state: 'test-state',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    const redirectUrl = new URL(body.url);

    expect(redirectUrl.origin).toBe('https://www.facebook.com');
    expect(redirectUrl.pathname).toBe('/v22.0/dialog/oauth');
    expect(redirectUrl.searchParams.get('client_id')).toBe('test-client-id');
    expect(redirectUrl.searchParams.get('state')).toBe('test-state');
    expect(redirectUrl.searchParams.get('scope')).toBe('email,public_profile');
    expect(redirectUrl.searchParams.get('redirect_uri')).toContain('/oauth/facebook/callback');
  });

  test('returns invalid user info when OAuth code is missing', async ({ request, baseURL }) => {
    expect(baseURL, 'MPKIT_URL must be set to run Facebook OAuth tests.').toBeTruthy();

    const response = await request.get('/test/oauth-facebook/user-info', {
      params: {
        client_id: 'test-client-id',
        secret_value: 'test-secret-value',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body).toEqual({ valid: false });
  });
});
