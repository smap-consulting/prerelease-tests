const { test, expect } = require("@playwright/test");

test("Webserver running", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/smap/i);
});
