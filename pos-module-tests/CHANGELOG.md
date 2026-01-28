# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-01-15

### Changed
- Logs' type will be unique test name generated at the beginning of each run to make it easy for pos-cli to display the result

## [1.1.1] - 2026-01-15

### Added
- Added `/_tests/run_async.js` endpoint which produces the final log with summary in JS

## [1.1.0] - 2026-01-15

### Added
- Added `/_tests.js` and `/_tests/run.js` formats to make it easy to invoke tests via CLI

### Fixed
- Fixed an issue that limited the maximum number of tests that can be invoked to 300
