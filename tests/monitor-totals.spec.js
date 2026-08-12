const { test, expect, request: playwrightRequest } = require("@playwright/test");
const {
  login,
  navigateTo,
  getProjectId,
  createSurvey,
  getFormMeta,
  submitInstance,
  getTotals,
  waitForTotals,
  deleteSurveys,
  requireEnv,
  SMAP_MONITOR_USER,
  SMAP_MONITOR_PASSWORD
} = require("./helpers");

/*
 * The monitor totals were six separate queries, one per status.  They are now a single query
 * counting each status with a filter, which changed the predicates, moved the "ignore old
 * issues" restriction into each filter, and rebuilt the parameter binding.  A binding swap
 * returns wrong or empty results rather than erroring, so it needs an end to end check.
 *
 * A survey is created per run so the expected counts are exact rather than relative to
 * whatever the server already holds.
 */

// Surveys created by the run, soft deleted afterwards so the project list does not fill up
const created = [];

test.afterEach(async ({ page }) => {
  await deleteSurveys(page, created.splice(0));
});

const EXPECTED_SUCCESS = 3;
const EXPECTED_DUPLICATES = 1;

test("monitor totals", async ({ page, baseURL }) => {
  test.setTimeout(300000);

  requireEnv("SMAP_MONITOR_PASSWORD", SMAP_MONITOR_PASSWORD);

  const runId = Date.now();
  const surveyName = `mon_${runId}`;
  const deviceId = `dev_${runId}`;
  let projectId;
  let survey;

  // /submission and /formXML are basic auth, unlike the session based /surveyKPI
  const odk = await playwrightRequest.newContext({
    baseURL,
    httpCredentials: { username: SMAP_MONITOR_USER, password: SMAP_MONITOR_PASSWORD }
  });

  await test.step("Login", async () => {
    await login(page, { username: SMAP_MONITOR_USER, password: SMAP_MONITOR_PASSWORD });
  });

  await test.step("Create a survey for this run", async () => {
    projectId = await getProjectId(page);
    survey = await createSurvey(page, projectId, surveyName);
    created.push(survey.id);
    expect(survey.ident).toBeTruthy();
  });

  const firstInstance = `uuid:${runId}-1`;
  let formMeta;

  await test.step("Submit three instances", async () => {
    formMeta = await getFormMeta(odk, survey.ident);
    for (let i = 1; i <= EXPECTED_SUCCESS; i++) {
      await submitInstance(odk, formMeta, {
        instanceId: i === 1 ? firstInstance : `uuid:${runId}-${i}`,
        textValue: `row ${i}`,
        deviceId
      });
    }
    await waitForTotals(
      page,
      { projectId, sName: survey.ident, groupby: "device" },
      (rows) => rows.length > 0 && rows[0].success === EXPECTED_SUCCESS
    );
  });

  /*
   * Sent only once the originals are applied.  Queued together they would be raced by the
   * subscriber threads, and while one of the pair would still be rejected, waiting keeps
   * which record is the duplicate deterministic.
   */
  await test.step("Resubmit the first instance as a duplicate", async () => {
    await submitInstance(odk, formMeta, {
      instanceId: firstInstance,
      textValue: "row 1 again",
      deviceId
    });
    await waitForTotals(
      page,
      { projectId, sName: survey.ident, groupby: "device" },
      (rows) => rows.length > 0 && rows[0].duplicates === EXPECTED_DUPLICATES
    );
  });

  await test.step("Totals by device are exact", async () => {
    const rows = await getTotals(page, {
      projectId,
      sName: survey.ident,
      groupby: "device"
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe(deviceId);
    expect(rows[0]).toMatchObject({
      success: EXPECTED_SUCCESS,
      duplicates: EXPECTED_DUPLICATES,
      errors: 0,
      merged: 0,
      not_loaded: 0,
      upload_errors: 0
    });
  });

  /*
   * Each grouping is a separate branch with its own aggregate expression, and all of them
   * bind user, survey ident, project and organisation in that order.  Summing across rows
   * must give the same totals whichever way the rows are cut.
   */
  await test.step("Every grouping sums to the same totals", async () => {
    for (const groupby of ["device", "month", "week", "day", undefined]) {
      const rows = await getTotals(page, {
        projectId,
        sName: survey.ident,
        groupby
      });
      const sum = (field) => rows.reduce((t, r) => t + r[field], 0);
      expect(
        { groupby: groupby || "(default)", success: sum("success"), duplicates: sum("duplicates") }
      ).toEqual({
        groupby: groupby || "(default)",
        success: EXPECTED_SUCCESS,
        duplicates: EXPECTED_DUPLICATES
      });
    }
  });

  /*
   * The all surveys branch binds its parameters in a different order (user, organisation,
   * project) and is the only one where the project is optional, so it is a separate risk.
   */
  await test.step("All surveys branch reports the same counts", async () => {
    const rows = await getTotals(page, { projectId, sName: "_all" });
    const row = rows.find((r) => r.key === surveyName);
    expect(row, `no row for ${surveyName} in ${JSON.stringify(rows)}`).toBeTruthy();
    expect(row.success).toBe(EXPECTED_SUCCESS);
    expect(row.duplicates).toBe(EXPECTED_DUPLICATES);
  });

  /*
   * A survey whose uploads are all successful is the case that separates the two behaviours,
   * so it is created here rather than relying on one happening to be left in the project by
   * another run.  Without it this check can pass for the wrong reason.
   */
  const allSuccessName = `mon_ok_${runId}`;
  await test.step("Create a survey with nothing but successes", async () => {
    const allSuccess = await createSurvey(page, projectId, allSuccessName);
    created.push(allSuccess.id);
    const meta = await getFormMeta(odk, allSuccess.ident);
    await submitInstance(odk, meta, {
      instanceId: `uuid:${runId}-ok`,
      deviceId
    });
    await waitForTotals(
      page,
      { projectId, sName: allSuccess.ident, groupby: "device" },
      (rows) => rows.length > 0 && rows[0].success === 1
    );
  });

  /*
   * The status flags are column toggles, not record filters: the monitor page renders a
   * column per property present in the response.  Hiding one must drop that property and
   * leave the set of rows alone.
   *
   * Previously each status was queried separately with the status in the where clause, so a
   * survey was listed only when one of the displayed statuses matched it, and hiding success
   * made the all-success survey disappear from the list entirely.
   */
  await test.step("Hiding a status does not change which rows are listed", async () => {
    const shown = await getTotals(page, { projectId, sName: "_all" });
    const hidden = await getTotals(page, {
      projectId,
      sName: "_all",
      hide: { success: true }
    });

    // The specific case, independent of anything else in the project
    expect(
      hidden.map((r) => r.key),
      `${allSuccessName} has only successes, so hiding the success column must not remove it`
    ).toContain(allSuccessName);

    // The general statement: the row set is a function of the data, not of the toggles
    expect(hidden.map((r) => r.key).sort()).toEqual(shown.map((r) => r.key).sort());

    const row = hidden.find((r) => r.key === surveyName);
    expect(row).toBeTruthy();
    expect(row.success).toBeUndefined();
    expect(row.duplicates).toBe(EXPECTED_DUPLICATES);
  });

  await test.step("Monitor page renders the survey", async () => {
    await navigateTo(page, "/app/fieldManager/monitor.html");
    await expect(page.locator("body")).toContainText(surveyName, { timeout: 30000 });
  });

  await odk.dispose();
});
