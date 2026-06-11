import { APIRequestContext } from '@playwright/test';

function getGraphQLHeaders(): Record<string, string> {
  const token = process.env.MPKIT_TOKEN;
  if (!token) throw new Error('MPKIT_TOKEN must be set to run GitHub OAuth API tests.');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Token ${token}`,
  };
}

async function parseGraphQLResponse(response: any): Promise<any> {
  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`GraphQL request failed (${response.status()}): ${text.substring(0, 200)}`);
  }
  const json = await response.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

export function getRequiredBaseURL(): string {
  const url = process.env.MPKIT_URL;
  if (!url) throw new Error('MPKIT_URL must be set to run GitHub OAuth API tests.');
  return url;
}

export async function callGitHubTokenEndpoint(
  request: APIRequestContext,
  baseURL: string,
  body: string
): Promise<any> {
  const mutation = `
    mutation($body: String, $headers: HashObject) {
      api_call_send(api_call: {
        url: "https://github.com/login/oauth/access_token"
        method: "POST"
        body: $body
        headers: $headers
      }) {
        response { body }
      }
    }
  `;
  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: {
      query: mutation,
      variables: {
        body,
        headers: { Accept: 'application/json' },
      },
    },
  });
  const json = await parseGraphQLResponse(response);
  return JSON.parse(json.data.api_call_send.response.body);
}

export async function callGitHubUserEndpoint(
  request: APIRequestContext,
  baseURL: string,
  accessToken: string
): Promise<any> {
  const mutation = `
    mutation($headers: HashObject) {
      api_call_send(api_call: {
        url: "https://api.github.com/user"
        method: "GET"
        headers: $headers
      }) {
        response { body }
      }
    }
  `;
  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: {
      query: mutation,
      variables: {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      },
    },
  });
  const json = await parseGraphQLResponse(response);
  return JSON.parse(json.data.api_call_send.response.body);
}

export async function callGitHubUserEmailsEndpoint(
  request: APIRequestContext,
  baseURL: string,
  accessToken: string
): Promise<any> {
  const mutation = `
    mutation($headers: HashObject) {
      api_call_send(api_call: {
        url: "https://api.github.com/user/emails"
        method: "GET"
        headers: $headers
      }) {
        response { body }
      }
    }
  `;
  const response = await request.post(`${baseURL}/api/graph`, {
    headers: getGraphQLHeaders(),
    data: {
      query: mutation,
      variables: {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      },
    },
  });
  const json = await parseGraphQLResponse(response);
  return JSON.parse(json.data.api_call_send.response.body);
}
