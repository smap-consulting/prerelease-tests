const { test, expect } = require("@playwright/test");

const SMAP_USER = process.env.SMAP_USER || "test1";
const SMAP_PASSWORD = process.env.SMAP_PASSWORD || "testx!21";

test("submit case and update", async ({ page }) => {
  test.setTimeout(180000);
  const getColumnIndex = async (table, columnName) => {
    const normalized = columnName.trim().toLowerCase();
    return table
      .locator("thead th")
      .evaluateAll(
        (ths, name) =>
          ths.findIndex((th) => {
            const label = (
              th.querySelector(".ch")?.textContent || th.textContent || ""
            )
              .trim()
              .toLowerCase();
            return label === name;
          }),
        normalized
      );
  };

  await test.step("Login", async () => {
    await page.goto("/app/myWork/index.html");

    if ((await page.title()) === "Login") {
      await page.fill("#username", SMAP_USER);
      await page.fill("#password", SMAP_PASSWORD);
      await page.click("button[name=\"login\"]");
    }

    await expect(page).toHaveURL(/\/app\/myWork\/index\.html$/);
  });

  const id1Value = `id1-${Date.now()}`;

  await test.step("Open form popup", async () => {
    await expect(page.getByRole("button", { name: "main" })).toBeEnabled();
    var [mainPage] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "main" }).click()
    ]);

    await expect(mainPage.locator("#form-title")).toHaveText("main");
  });

  // Get popup reference outside step for use in later steps
  const mainPage = (await page.context().pages()).find((p) => p !== page);

  await test.step("Submit case", async () => {
    await mainPage.fill("input[name=\"/main/id1\"]", id1Value);
    await Promise.all([
      mainPage.waitForResponse(
        (resp) => resp.request().method() === "POST" && resp.ok()
      ),
      mainPage.click("#submit-form")
    ]);
  });

  await test.step("Verify in tracking table", async () => {
    await mainPage.goto("/app/tasks/managed_forms.html");
    await mainPage.waitForLoadState("networkidle");

    const trackingTable = mainPage.locator("#trackingTable");
    await expect(trackingTable.locator("thead")).toContainText("id1");

    const id1ColumnIndex = await getColumnIndex(trackingTable, "id1");
    expect(id1ColumnIndex).toBeGreaterThanOrEqual(0);

    const id1ColumnCells = trackingTable.locator(
      `tbody tr td:nth-child(${id1ColumnIndex + 1})`
    );
    await expect
      .poll(
        async () => {
          const texts = await id1ColumnCells.allTextContents();
          if (texts.some((text) => text.includes(id1Value))) return true;
          await mainPage.reload();
          await mainPage.waitForLoadState("networkidle");
          return false;
        },
        { timeout: 60000 }
      )
      .toBe(true);

    await trackingTable
      .locator(`tbody tr td:nth-child(${id1ColumnIndex + 1})`, {
        hasText: id1Value
      })
      .first()
      .click();
  });

  const id2Value = `id2-${Date.now()}`;

  await test.step("Update with oversight form", async () => {
    await mainPage.selectOption("#survey_name", { label: "main" });
    await mainPage.selectOption("#oversight_survey", { label: "oversight" });
    await mainPage.click("#m_lock");
    await expect(mainPage.locator("#m_edit")).toBeVisible();
    await Promise.all([
      mainPage.waitForLoadState("domcontentloaded"),
      mainPage.click("#m_edit")
    ]);
    await expect(mainPage.locator("#form-title")).toHaveText("oversight");
    await expect(mainPage.locator("input[name=\"/main/id1\"]")).toHaveValue(
      id1Value
    );
    await mainPage.fill("input[name=\"/main/id2\"]", id2Value);
    await Promise.all([
      mainPage.waitForLoadState("domcontentloaded"),
      mainPage.click("#submit-form-single")
    ]);
    await mainPage.click("#goback");
  });

  await test.step("Verify both fields persisted", async () => {
    try {
      await expect(mainPage).toHaveURL(/managed_forms\.html/, { timeout: 10000 });
    } catch {
      await mainPage.goto("/app/tasks/managed_forms.html");
    }
    await mainPage.locator("#hideFilters").waitFor({ timeout: 60000 });

    const refreshedTable = mainPage.locator("#trackingTable");

    let refreshedId1Index, refreshedId2Index;
    await expect
      .poll(
        async () => {
          refreshedId1Index = await getColumnIndex(refreshedTable, "id1");
          refreshedId2Index = await getColumnIndex(refreshedTable, "id2");
          return refreshedId1Index >= 0 && refreshedId2Index >= 0;
        },
        { timeout: 20000 }
      )
      .toBe(true);

    await expect
      .poll(
        async () => {
          const rows = refreshedTable.locator("tbody tr");
          const rowCount = await rows.count();
          let matches = 0;

          for (let i = 0; i < rowCount; i += 1) {
            const row = rows.nth(i);
            const id1Text =
              (await row
                .locator(`td:nth-child(${refreshedId1Index + 1})`)
                .textContent()) || "";
            const id2Text =
              (await row
                .locator(`td:nth-child(${refreshedId2Index + 1})`)
                .textContent()) || "";

            if (id1Text.includes(id1Value) && id2Text.includes(id2Value)) {
              matches += 1;
            }
          }

          return matches;
        },
        { timeout: 20000 }
      )
      .toBe(1);
  });
});
