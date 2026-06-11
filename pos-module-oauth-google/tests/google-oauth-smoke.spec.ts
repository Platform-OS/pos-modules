import { test, expect } from '@playwright/test';

test.describe('Google OAuth module', () => {
  test('builds a Google authorization redirect URL', async ({ request, baseURL }) => {
    expect(baseURL, 'MPKIT_URL must be set to run Google OAuth tests.').toBeTruthy();

    const response = await request.get('/test/oauth-google/redirect-url', {
      params: {
        client_id: 'test-client-id',
        state: 'test-state',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    const redirectUrl = new URL(body.url);

    expect(redirectUrl.origin).toBe('https://accounts.google.com');
    expect(redirectUrl.pathname).toBe('/o/oauth2/v2/auth');
    expect(redirectUrl.searchParams.get('client_id')).toBe('test-client-id');
    expect(redirectUrl.searchParams.get('state')).toBe('test-state');
    expect(redirectUrl.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid'
    );
    expect(redirectUrl.searchParams.get('response_type')).toBe('code');
    expect(redirectUrl.searchParams.get('redirect_uri')).toContain('/oauth/google/callback');
  });

  test('returns invalid user info when OAuth code is missing', async ({ request, baseURL }) => {
    expect(baseURL, 'MPKIT_URL must be set to run Google OAuth tests.').toBeTruthy();

    const response = await request.get('/test/oauth-google/user-info', {
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
