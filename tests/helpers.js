const { expect } = require("@playwright/test");

const SMAP_TEST1_USER = process.env.SMAP_TEST1_USER || "test1";
const SMAP_TEST1_PASSWORD = process.env.SMAP_TEST1_PASSWORD;
if (!SMAP_TEST1_PASSWORD) throw new Error("SMAP_TEST1_PASSWORD env var is required");

const SMAP_TEST2_USER = process.env.SMAP_TEST2_USER || "test2";
const SMAP_TEST2_PASSWORD = process.env.SMAP_TEST2_PASSWORD;

async function login(page, options = {}) {
  // Backwards compat: second arg may be a landingPath string or an options object.
  if (typeof options === "string") options = { landingPath: options };
  const {
    landingPath = "/app/myWork/index.html",
    username = SMAP_TEST1_USER,
    password = SMAP_TEST1_PASSWORD
  } = options;
  await page.goto(landingPath);
  if ((await page.title()) === "Login") {
    await page.fill("#username", username);
    await page.fill("#password", password);
    await page.click("button[name=\"login\"]");
  }
  await expect(page).toHaveURL(new RegExp(landingPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
}

async function navigateTo(page, path) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

module.exports = {
  SMAP_TEST1_USER,
  SMAP_TEST1_PASSWORD,
  SMAP_TEST2_USER,
  SMAP_TEST2_PASSWORD,
  login,
  navigateTo
};
