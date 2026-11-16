# Migrations

Notes for upgrading between versions of the support module. Each entry lists what changes in data or configuration and what, if anything, an installation must do.

## 0.1.0 (first release, not published yet)

No upgrade steps. Until the release, `pos-module.json` stays at 0.0.1; `npm run version` (minor) makes it 0.1.0 and writes the changelog from the commits. The module's migrations only seed the defaults and start the background jobs; fixes to development data are not shipped as migrations.
