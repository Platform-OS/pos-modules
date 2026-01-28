# Github OAuth2 Provider

This module contains logic required to enable OAuth2 using GitHub.

## Configuration
There are two steps to enable OAuth2:
- install the Github OAuth2 module
- configure required constants

To install the GitHub OAuth 2 module, add it to your instance via the partner portal or run the following commands:

```
pos-cli modules install oauth_github
pos-cli modules download oauth_github
```

To configure the GitHub OAuth2 module, please set the following constants in your platformOS instance:

| Constant | Value |
| - | - |
| OAUTH2_GITHUB_PROVIDER | `github` |
| OAUTH2_GITHUB_CLIENT_ID | Client ID of the OAuth 2 application. |
| OAUTH2_GITHUB_SECRET_VALUE| Client Secret of the OAuth 2 application. |
