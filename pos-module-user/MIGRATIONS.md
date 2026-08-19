# Migrations

### Updating to 5.3.1

Fixes to the 5.3.0 email verification feature, plus one unrelated routing
regression. Nothing to run, but five of them are visible from outside the module.

**Impersonation is reachable again: `POST /sessions/impersonations`.** 5.2.12
changed that page's slug to `sessions/impersonations/:user_id`. Without
parentheses that segment is required, so a form submitting the id as a field -
which is what the module's own example app does, since a `select` cannot put the
id in the path - matched no route at all and got a 404 on any instance with
`slug_exact_match` enabled, the default for new instances. "Impersonate" silently
did nothing. On older instances the legacy matcher let it through, which is why it
went unnoticed.

The slug is now `sessions/impersonations(/:user_id)`, so both spellings work and
nothing needs changing at your end: `POST /sessions/impersonations/<id>` still
resolves, and so does a `POST /sessions/impersonations` carrying `user_id` as a
parameter.

**Verification links were valid for 60 days, not 24 hours.** `temporary_token`
reads both of its arguments in hours and prefers the deprecated `valid_for` over
`expires_in`, so passing the TTL as minutes in `valid_for` multiplied it by 60.
A link that grants a session lived two months. Links already in inboxes keep the
lifetime they were issued with - changing a user's password is what invalidates
their outstanding tokens.

**`user/find.graphql` no longer declares `$valid_for`.** It defaulted to `1`,
which took precedence over the `$expires_in: Float = 48` next to it, so every
caller silently got a one hour token no matter what it asked for. If you
overrode this file, or call `queries/user/find` with `valid_for`, switch to
`expires_in` - in hours. Password reset links still last one hour: the value is
now stated in `commands/authentication_links/create/build` instead of coming out
of that default. Note that the module has disagreed with itself about this
number - the command documented five minutes, the graphql declared 48 hours, and
what shipped was one hour - so if one hour is not what you want, that is the
place to change it.

**A translation key was renamed.** `email_verification.check_email.sent_to_html`
is now `sent_to`, without the `<strong>` markup it used to carry. `t` marks a
translation html_safe only when nothing was interpolated into it - that is what
escapes the address, which reaches the screen from a query parameter - and the
same rule escaped the entry's own `<strong>` tags, so users were shown them as
literal text. On an instance with `safe_translate` switched off the rule does not
apply and the old entry passed the address through as markup. If you copied the
translations or the partial, take the new versions.

**`commands/email_verifications/create` takes `verify_hcaptcha`.** Only an
endpoint that rendered the widget should ask for the answer to be checked, and
the `hcaptcha` filter raises rather than returning false when handed nothing -
which turned registration into a 500, after the account had been created, on any
instance with `VERIFY_HCAPTCHA` on. Pass `verify_hcaptcha: true` from your own
callers only if they render the widget.

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

   Generate a migration and paste this in. It walks every profile and marks the
   ones with no timestamp as verified as of when the account was created:

```liquid
{% liquid
  assign page = 1
  assign processed = 0

  for _ in (1..1000)
    function profiles = 'modules/user/queries/profiles/search', page: page, limit: 100, query: null, id: null, ids: null, not_ids: null, uuid: null, user_id: null, emails: null, first_name: null, last_name: null, sort: null

    if profiles.results.size == 0
      break
    endif

    for profile in profiles.results
      if profile.email_verified_at == blank
        assign object = { "id": profile.id, "email_verified_at": profile.created_at }
        function _ = 'modules/user/commands/profiles/mark_email_verified', object: object
        assign processed = processed | plus: 1
      endif
    endfor

    if profiles.has_next_page != true
      break
    endif

    assign page = page | plus: 1
  endfor

  log processed, type: 'backfill_email_verified_at: profiles marked verified'
%}
```

   The loop bound covers 100,000 profiles. Above that, or if the migration runs
   out of time, raise `limit`, run it more than once, or move the work into a
   background job - it is safe to re-run, since it only touches profiles whose
   timestamp is still blank.

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
