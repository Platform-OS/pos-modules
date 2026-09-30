# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- A test that raised ended the whole run and every other test's result was discarded with it,
  including tests that had already completed. The runner collects each contract in a variable and
  renders the report after the loop, in the same render, so a raise aborted the render and took the
  collected results with it — the caller got the platform's 500 error page and nothing about the
  run. Each test is now run inside `try`/`catch`: a raise is recorded on that test's own contract
  under `(raised)`, with the exception class, file, line and message, and every other test still
  runs and still reports. A run containing a raise is still a failing run and still answers 500.
  Measured on a live instance: a 26-test suite that answered nothing now reports 19 passing, 5
  raised and 2 assertion failures.
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
