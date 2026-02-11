const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  expect: { timeout: 5000 },
  retries: 1,
  use: {
    baseURL: process.env.SMAP_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
});
