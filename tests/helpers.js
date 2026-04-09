const { expect } = require("@playwright/test");

const SMAP_TEST1_USER = process.env.SMAP_TEST1_USER || "test1";
const SMAP_TEST1_PASSWORD = process.env.SMAP_TEST1_PASSWORD;
if (!SMAP_TEST1_PASSWORD) throw new Error("SMAP_TEST1_PASSWORD env var is required");

async function login(page, landingPath = "/app/myWork/index.html") {
  await page.goto(landingPath);
  if ((await page.title()) === "Login") {
    await page.fill("#username", SMAP_TEST1_USER);
    await page.fill("#password", SMAP_TEST1_PASSWORD);
    await page.click("button[name=\"login\"]");
  }
  await expect(page).toHaveURL(new RegExp(landingPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
}

async function navigateTo(page, path) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

module.exports = { SMAP_TEST1_USER, SMAP_TEST1_PASSWORD, login, navigateTo };
