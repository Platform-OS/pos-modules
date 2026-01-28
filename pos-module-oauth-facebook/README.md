# Facebook OAuth2 Provider

This module contains logic required to enable OAuth2 using Facebook.

## Configuration
There are two steps to enable OAuth2:
- install the Facebook OAuth2 module
- configure required constants

To install the Facebook OAuth 2 module, add it to your instance via the partner portal or run the following commands:

```
pos-cli modules install oauth_facebook
pos-cli modules download oauth_facebook
```

To configure the Facebook OAuth2 module, please set the following constants in your platformOS instance:

| Constant | Value |
| - | - |
| OAUTH2_FACEBOOK_PROVIDER | `facebook` |
| OAUTH2_FACEBOOK_CLIENT_ID | Client ID of the OAuth 2 application. |
| OAUTH2_FACEBOOK_SECRET_VALUE| Client Secret of the OAuth 2 application. |
