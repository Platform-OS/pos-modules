# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- The JSON test report was always empty. `show_js` iterated the empty array it had just created
  instead of the test contracts, so `/_tests/run.js`, `/_tests/run` and the `run_async.js` summary
  log all answered `"total_assertions": 0` and `"tests": []` on every run, however many tests ran
  and however many failed. Per-test name, success, assertion count and failure messages are now
  reported, which is what those fields were always meant to carry. `total_tests`, `total_errors`
  and the 500-on-failure status are unchanged.
- The `/_tests` JSON index advertised `/_tests/run.js?test_name=<name>`. The runner filters on
  `name`, so following any URL the index listed ran the entire suite instead of the test that was
  clicked. It now advertises `?name=`, which is what the HTML index has always used.

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
