# platformOS Data Export API module

The goal of this module is to allow to export instance data via API.

This module will run migration that will generate and set constant `_data_export_api_key`, which will be used to authenticate API requests.

Supported features:

* Export only records, only users, or both
* Use GraphQL to decide which records/users should be exported
* Provide your PGP Key to encrypt the exported data
* Restrict IP Addresses which can invoke API - set `_data_export_whitelisted_ips` constant and specify allowed IP addresses separated with `,` (for example `83.28.78.119,83.28.78.120,83.28.78.121`)

Please refer to [Postman documentation](https://documenter.getpostman.com/view/33771176/2sA35A6QEm)
