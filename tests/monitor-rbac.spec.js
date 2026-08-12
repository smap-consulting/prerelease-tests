const { test, expect, request: playwrightRequest } = require("@playwright/test");
const {
  login,
  getProjectId,
  getRoleId,
  createSurvey,
  getFormMeta,
  submitInstance,
  waitForTotals,
  getSubmissions,
  deleteSurveys,
  enableSurveyRole,
  requireEnv,
  MONITOR_ROLE,
  SMAP_MONITOR_USER,
  SMAP_MONITOR_PASSWORD,
  SMAP_RBAC_YES_USER,
  SMAP_RBAC_YES_PASSWORD,
  SMAP_RBAC_NO_USER,
  SMAP_RBAC_NO_PASSWORD
} = require("./helpers");

/*
 * getSurveyRBACUploadEvent() changed from "not in" to "not exists".  Its only caller is
 * SubmissionsManager, so the check runs against the submissions API rather than the monitor
 * page - the monitor totals do not apply survey level RBAC at all.
 *
 * Two branches matter: a survey with a role enabled is only visible to holders of that role,
 * and a survey with no roles stays visible to everybody.  The second is the branch the
 * rewrite touched and the one that fails silently if it regresses.
 *
 * Limit of this test: the bug actually fixed was a null survey_role.survey_ident, which made
 * "not in" evaluate to null for every row and hid roleless surveys from everybody.  A null
 * cannot be created through the UI, so that case stays a SQL check - see the README.
 */

// Surveys created by the run, soft deleted afterwards so the project list does not fill up
const created = [];

test.afterEach(async ({ page }) => {
  await deleteSurveys(page, created.splice(0));
});

test("monitor rbac", async ({ page, baseURL }) => {
  test.setTimeout(300000);

  requireEnv("SMAP_MONITOR_PASSWORD", SMAP_MONITOR_PASSWORD);
  requireEnv("SMAP_RBAC_YES_PASSWORD", SMAP_RBAC_YES_PASSWORD);
  requireEnv("SMAP_RBAC_NO_PASSWORD", SMAP_RBAC_NO_PASSWORD);

  const runId = Date.now();
  const restrictedName = `rbac_restricted_${runId}`;
  const openName = `rbac_open_${runId}`;
  let projectId;
  let restricted;
  let open;

  const asUser = (username, password) =>
    playwrightRequest.newContext({ baseURL, httpCredentials: { username, password } });

  const odk = await asUser(SMAP_MONITOR_USER, SMAP_MONITOR_PASSWORD);

  await test.step("Set up two surveys, one role restricted", async () => {
    await login(page, { username: SMAP_MONITOR_USER, password: SMAP_MONITOR_PASSWORD });
    projectId = await getProjectId(page);

    restricted = await createSurvey(page, projectId, restrictedName);
    open = await createSurvey(page, projectId, openName);
    created.push(restricted.id, open.id);

    const roleId = await getRoleId(page, MONITOR_ROLE);
    await enableSurveyRole(page, restricted.id, roleId);
  });

  await test.step("Submit one instance to each", async () => {
    for (const survey of [restricted, open]) {
      const meta = await getFormMeta(odk, survey.ident);
      await submitInstance(odk, meta, {
        instanceId: `uuid:${runId}-${survey.ident}`,
        deviceId: `dev_${runId}`
      });
    }
  });

  await test.step("Wait for both to be applied", async () => {
    // The submissions API only returns records where results_db_applied is set, so the
    // totals are used purely as the signal that the subscriber has finished.
    for (const survey of [restricted, open]) {
      await waitForTotals(
        page,
        { projectId, sName: survey.ident, groupby: "device" },
        (rows) => rows.length > 0 && rows[0].success === 1
      );
    }
  });

  await test.step("User with the role sees the restricted survey", async () => {
    const req = await asUser(SMAP_RBAC_YES_USER, SMAP_RBAC_YES_PASSWORD);
    expect(await getSubmissions(req, restricted.ident)).not.toHaveLength(0);
    await req.dispose();
  });

  await test.step("User without the role does not", async () => {
    const req = await asUser(SMAP_RBAC_NO_USER, SMAP_RBAC_NO_PASSWORD);
    expect(await getSubmissions(req, restricted.ident)).toHaveLength(0);
    await req.dispose();
  });

  await test.step("A survey with no roles stays visible to both", async () => {
    for (const [user, password] of [
      [SMAP_RBAC_YES_USER, SMAP_RBAC_YES_PASSWORD],
      [SMAP_RBAC_NO_USER, SMAP_RBAC_NO_PASSWORD]
    ]) {
      const req = await asUser(user, password);
      expect(
        await getSubmissions(req, open.ident),
        `${user} should still see the unrestricted survey`
      ).not.toHaveLength(0);
      await req.dispose();
    }
  });

  await odk.dispose();
});
