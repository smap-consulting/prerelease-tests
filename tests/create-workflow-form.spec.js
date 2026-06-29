const { test, expect } = require("@playwright/test");
const {
  login,
  navigateTo,
  SMAP_TEST1_USER,
  SMAP_TEST1_PASSWORD
} = require("./helpers");

test("create workflow form", async ({ page }) => {
  test.setTimeout(180000);

  // Tall viewport so drawer buttons (save/delete) render within the viewport
  // and can be clicked normally.
  await page.setViewportSize({ width: 1440, height: 2400 });

  await test.step("Login", async () => {
    if (!SMAP_TEST1_PASSWORD)
      throw new Error("SMAP_TEST1_PASSWORD env var is required");
    await login(page, {
      username: SMAP_TEST1_USER,
      password: SMAP_TEST1_PASSWORD
    });
  });

  await test.step("Open workflow page", async () => {
    await navigateTo(page, "/app/tasks/workflow.html");
  });

  await test.step("Add workflow item", async () => {
    await page.click("#wf-add-btn");
    await expect(page.locator("#wf-drawer")).toBeVisible();
  });

  await test.step("Choose form type", async () => {
    await page.click('.wf-create-type-btn[data-type="form"]');
  });

  await test.step("Select survey", async () => {
    const survey = page.locator("#wfd-form-survey");
    await expect(survey).toBeVisible();
    await survey.selectOption({ label: "Test / main" });
  });

  await test.step("Save workflow item", async () => {
    await page.click("#wf-drawer-save");
  });

  const workitem = page.locator(
    'div[data-role="form"][data-type="form"][data-name="main"][data-project="Test"]'
  );

  await test.step("Select the new workitem", async () => {
    await expect(workitem).toBeVisible();
    await workitem.click();
  });

  await test.step("Click the connector badge", async () => {
    const badge = workitem.locator(".wf-connector-badge");
    await expect(badge).toBeVisible();
    await badge.click();
  });

  // Capture existing email task nodes so we can identify the new one after save
  // (prior runs may leave nodes behind until cleanup is added).
  const existingEmailIds = await page
    .locator('div[data-role="form"][data-type="emailtask"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));

  await test.step("Choose email task type", async () => {
    await expect(page.locator("#wf-drawer")).toBeVisible();
    await page
      .locator('#wf-drawer [data-type="emailtask"]')
      .dispatchEvent("click");
  });

  await test.step("Enter task name", async () => {
    await page.fill("#wfd-name", "Email Task Test");
  });

  await test.step("Select task survey", async () => {
    const survey = page.locator("#wfd-task-survey");
    await expect(survey).toBeVisible();
    await survey.selectOption({ label: "Test / main" });
  });

  await test.step("Enter email recipient", async () => {
    await page.fill("#wfd-task-email-to", "xxx@xxx.com");
  });

  await test.step("Save email task", async () => {
    await page.locator("#wf-drawer-save").dispatchEvent("click");
  });

  const emailNodes = page.locator(
    'div[data-role="form"][data-type="emailtask"]'
  );

  let newId;

  await test.step("Edit the new email task", async () => {
    // Wait for the newly-created node to appear, then target it by its
    // unique data-id (the one not present before saving).
    await expect
      .poll(async () => emailNodes.count(), { timeout: 10000 })
      .toBeGreaterThan(existingEmailIds.length);

    const allIds = await emailNodes.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-id"))
    );
    newId = allIds.find((id) => !existingEmailIds.includes(id));
    if (!newId) throw new Error("Could not identify the new email task node");

    const emailTask = page.locator(`div[data-id="${newId}"]`);
    await expect(emailTask).toBeVisible();
    // The edit button is injected into the node on hover, so a real hover is
    // required (dispatchEvent click won't trigger mouseenter).
    await emailTask.hover();
    await emailTask.locator(".wf-node-edit-btn").click();
    await expect(page.locator("#wf-drawer")).toBeVisible();
  });

  await test.step("Follow advanced link in a new tab", async () => {
    const [newPage] = await Promise.all([
      page.context().waitForEvent("page"),
      page.click("#wf-drawer-advanced")
    ]);
    await newPage.waitForLoadState();
    await expect(newPage).toHaveURL(/app\/tasks\/taskManagement\.html/);

    await expect(newPage.locator("#addTask")).toBeVisible();

    const selected = newPage.locator("#survey_to_complete option:checked");
    await expect(selected).toHaveText("main");

    await newPage.close();
  });

  // Delete the nodes this test created so the canvas stays clean for reruns.
  const deleteNode = async (node) => {
    await expect(node).toBeVisible();
    await node.hover();
    await node.locator(".wf-node-edit-btn").click();
    await expect(page.locator("#wf-drawer")).toBeVisible();
    await page.locator("#wf-drawer-delete").click();
    await page.locator("#wf-delete-confirm").click();
    await expect(node).toBeHidden({ timeout: 15000 });
  };

  await test.step("Delete the email task", async () => {
    await deleteNode(page.locator(`div[data-id="${newId}"]`));
  });

  await test.step("Delete the form node", async () => {
    await deleteNode(workitem);
  });
});
