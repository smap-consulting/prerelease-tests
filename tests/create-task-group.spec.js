const { test, expect } = require("@playwright/test");
const {
  login,
  navigateTo,
  SMAP_TEST2_USER,
  SMAP_TEST2_PASSWORD
} = require("./helpers");

test("create task group", async ({ page }) => {
  test.setTimeout(180000);

  await test.step("Login", async () => {
    if (!SMAP_TEST2_PASSWORD)
      throw new Error("SMAP_TEST2_PASSWORD env var is required");
    await login(page, {
      username: SMAP_TEST2_USER,
      password: SMAP_TEST2_PASSWORD
    });
  });

  await test.step("Open task management page", async () => {
    await navigateTo(page, "/app/tasks/taskManagement.html");
  });

  await test.step("Add task group", async () => {
    await page.click("#m_task_groups");
    await page.click("#addTaskGroup");
  });

  await test.step("Select add from survey", async () => {
    await page.check("#add_from_survey");
  });

  await test.step("Survey select has at least one choice", async () => {
    const survey = page.locator("#survey");
    await expect(survey).toBeVisible();
    await expect
      .poll(async () => survey.locator("option").count(), { timeout: 10000 })
      .toBeGreaterThan(0);
  });

  await test.step("Survey to complete select has at least one choice", async () => {
    const surveyToComplete = page.locator("#survey_to_complete");
    await expect(surveyToComplete).toBeVisible();
    await expect
      .poll(async () => surveyToComplete.locator("option").count(), {
        timeout: 10000
      })
      .toBeGreaterThan(0);
  });

  const taskGroupName = `tg-${Date.now()}`;

  await test.step("Enter task group name", async () => {
    await page.fill("#task_group_name", taskGroupName);
  });

  await test.step("Enable advanced result filtering", async () => {
    await page.check("#filter_results_advanced");
  });

  await test.step("Check add current", async () => {
    await page.check("#add_current");
  });

  await test.step("Enter advanced filter", async () => {
    await page.fill("#tg_ad_filter", "${q1} = 'a'");
  });

  await test.step("Save task group", async () => {
    await page.click("#addNewGroupSave");
  });

  await test.step("Confirm dialog closed", async () => {
    await expect(page.locator("#addTask")).toBeHidden();
  });
});
