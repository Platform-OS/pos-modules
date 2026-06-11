import { test, expect } from '@playwright/test';

test.describe('GitHub OAuth module', () => {
  test('builds a GitHub authorization redirect URL', async ({ request, baseURL }) => {
    expect(baseURL, 'MPKIT_URL must be set to run GitHub OAuth tests.').toBeTruthy();

    const response = await request.get('/test/oauth-github/redirect-url', {
      params: {
        client_id: 'test-client-id',
        state: 'test-state',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    const redirectUrl = new URL(body.url);

    expect(redirectUrl.origin).toBe('https://github.com');
    expect(redirectUrl.pathname).toBe('/login/oauth/authorize');
    expect(redirectUrl.searchParams.get('client_id')).toBe('test-client-id');
    expect(redirectUrl.searchParams.get('state')).toBe('test-state');
    expect(redirectUrl.searchParams.get('scope')).toBe('user:email');
  });

  test('returns invalid user info when OAuth code is missing', async ({ request, baseURL }) => {
    expect(baseURL, 'MPKIT_URL must be set to run GitHub OAuth tests.').toBeTruthy();

    const response = await request.get('/test/oauth-github/user-info', {
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
