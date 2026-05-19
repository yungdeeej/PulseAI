// Test-only env defaults. Real env values are loaded by Node when running the
// bot — but the unit tests don't need real credentials to validate code paths.
process.env.HELIUS_API_KEY ??= "test-helius-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/pulse_test";
process.env.DRY_RUN ??= "true";
process.env.LOG_LEVEL ??= "error";
process.env.NODE_ENV ??= "production";
