# Migrations

### Updating to 5.3.0 (email verification)

5.3.0 adds an optional email verification step to registration. **It is off by
default** - upgrading changes nothing until you set the constant below, so no
action is required if you do not want the feature.

If you do want it, run these steps **in this order**:

1. Deploy the module. The new `profile` properties (`email_verified_at`,
   `email_verification_sent_at`, `email_verification_sent_count`) are additive
   and nullable, so nothing breaks at this point.

2. **Backfill your existing profiles before enabling the feature.**
   `email_verified_at` being blank is what marks a user as unverified, so every
   current user would be locked out at their next login if you skip this.
   See `app/migrations/20260813090000_backfill_email_verified_at.liquid` for a
   ready-made script, or run the equivalent yourself.

3. Enable it:

```
{% liquid
  function result = 'modules/core/commands/variable/set', name: 'USER_EMAIL_VERIFICATION_ENABLED', value: 'true'
%}
```

4. Optionally tune `USER_EMAIL_VERIFICATION_TTL_HOURS` (default 24),
   `USER_EMAIL_VERIFICATION_RESEND_INTERVAL` (default 60 seconds) and
   `USER_EMAIL_VERIFICATION_RESEND_DAILY_MAX` (default 5).

To turn the feature off again, unset `USER_EMAIL_VERIFICATION_ENABLED`. Users
who registered while it was on can log in as normal - the flag only ever gates
whether the check is applied.

**Note for apps with `user_created` consumers:** with verification enabled,
`user_created` still fires at registration, which now means it fires for
accounts that may never be confirmed. If a consumer should only run for
confirmed users, move it to the new `user_email_verified` event.

### Updating from <5.0.0 to 5.0.0
In order to update the module from previous versions to version 5.0.0, install the newest user module and then perform the following steps:
1. Run the profile migration graphql query:
```
mutation {
  records_update_all(sync: false, table: "modules/profile/profile", record: { table: "modules/user/profile" }) {
    count
  }
}
```
Validate if all records from the modules/profile/profiles table have been properly migrated to modules/user/profiles.

2. Run the following liquid script to migrate roles from user table to the new profile table:
```
{% liquid
graphql total = 'modules/user/user/count'
assign count = total.users.total_entries
assign pages = count | divided_by: 1000.0 | ceil

for page in (1..pages)
  graphql r = 'modules/user/user/search', page: page, limit: 1000, include_profiles: true
  for user in r.users.results
    assign roles = user.roles
    assign profile = user.profiles.first

    if profile != null
      assign object = '{}' | parse_json | hash_merge: valid: true, id: profile.id, roles: roles
      function object = 'modules/core/commands/execute', object: object, mutation_name: 'modules/user/profiles/roles/set'
    endif
  endfor
endfor
%}
```

3. Remove the profile module and delete the modules/profile/profile table.

4.  Remove roles from user configuration in the [app/user.yml](https://documentation.platformos.com/developer-guide/users/user#adding-properties-to-the-user) file if present.

5. Update application code to use current profile ```modules/user/helpers/current_profile``` instead of user for checking permissions.
