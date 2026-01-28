# Google OAuth2 Provider

This module contains logic required to enable OAuth2 using Google.

## Configuration
There are two steps to enable OAuth2:
- install the Google OAuth2 module
- configure required constants

To install the Google OAuth 2 module, add it to your instance via the partner portal or run the following commands:

```
pos-cli modules install oauth_google
pos-cli modules download oauth_google
```

To configure the Google OAuth2 module, please set the following constants in your platformOS instance:

| Constant | Value |
| - | - |
| OAUTH2_GOOGLE_PROVIDER | `google` |
| OAUTH2_GOOGLE_CLIENT_ID | Client ID of the OAuth 2 application. |
| OAUTH2_GOOGLE_SECRET_VALUE| Client Secret of the OAuth 2 application. |
