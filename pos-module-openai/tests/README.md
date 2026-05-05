# Tests

The current test suite contains two basic smoke tests (`tests/pages/unconfigured.spec.ts`) that navigate to the example pages and verify that the "OpenAI is not configured in this environment." message is displayed when `OPENAI_SECRET_TOKEN` is absent.

To develop a more meaningful test suite, `modules/openai/OPENAI_SECRET_TOKEN` must be set as a constant on the target instance.
