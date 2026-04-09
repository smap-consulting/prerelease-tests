const { test, expect } = require("@playwright/test");
const { login } = require("./helpers");

test("choices page appears in online editor", async ({ page }) => {
  test.setTimeout(60000);

  await test.step("Login", async () => {
    await login(page, "/app/fieldManager/surveyManagement.html");
  });

  await test.step("Open editor for edit_test", async () => {
    await page.locator("a.displayName", { hasText: "edit_test" }).click();
    await page.waitForLoadState("networkidle");
    await page.locator("ol#formList li.card").first().waitFor({ timeout: 30000 });
  });

  await test.step("Click edit_choice button for q1", async () => {
    await page.locator("input[value='q1']").first().waitFor({ timeout: 10000 });

    const row = page.locator("div.row").filter({
      has: page.locator("input[value='q1']")
    });
    await expect(row).toBeVisible();

    const editChoiceBtn = row.locator("div.q_icons_col div.btn-group a.edit_choice");
    await expect(editChoiceBtn).toBeVisible();
    await editChoiceBtn.click();
  });

  await test.step("Assert choices table is visible", async () => {
    const optionTable = page.locator("#optionTable");
    await expect(optionTable).toBeVisible();
    await expect(optionTable.locator("table")).toBeVisible();
  });
});
