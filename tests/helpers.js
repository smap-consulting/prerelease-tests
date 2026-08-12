const { expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const SMAP_TEST1_USER = process.env.SMAP_TEST1_USER || "test1";
const SMAP_TEST1_PASSWORD = process.env.SMAP_TEST1_PASSWORD;
if (!SMAP_TEST1_PASSWORD) throw new Error("SMAP_TEST1_PASSWORD env var is required");

const SMAP_TEST2_USER = process.env.SMAP_TEST2_USER || "test2";
const SMAP_TEST2_PASSWORD = process.env.SMAP_TEST2_PASSWORD;

// Drives the monitor test setup: uploads the survey, submits, and enables the role.  Kept
// separate from test1 so the monitor tests do not force extra privilege onto a user the
// other specs share.
const SMAP_MONITOR_USER = process.env.SMAP_MONITOR_USER || "test_monitor";
const SMAP_MONITOR_PASSWORD = process.env.SMAP_MONITOR_PASSWORD;

const SMAP_RBAC_YES_USER = process.env.SMAP_RBAC_YES_USER || "test_rbac_yes";
const SMAP_RBAC_YES_PASSWORD = process.env.SMAP_RBAC_YES_PASSWORD;

const SMAP_RBAC_NO_USER = process.env.SMAP_RBAC_NO_USER || "test_rbac_no";
const SMAP_RBAC_NO_PASSWORD = process.env.SMAP_RBAC_NO_PASSWORD;

// Project and role created by hand before the run - see the README prerequisites
const MONITOR_PROJECT = process.env.SMAP_MONITOR_PROJECT || "Monitor Test";
const MONITOR_ROLE = process.env.SMAP_MONITOR_ROLE || "prerelease_rbac";

// The XLSForm the monitor tests upload.  One text question named "text".
const MONITOR_FORM = path.join(__dirname, "..", "monitor-test-form.xlsx");

// Smap rejects admin API calls that do not look like ajax
const XHR = { "X-Requested-With": "XMLHttpRequest" };

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

/*
 * Admin API calls reuse the browser context, so they carry the session cookie of whoever
 * logged in on that page.  That is what makes the RBAC checks meaningful.
 */
async function apiJson(page, url) {
  const res = await page.request.get(url, { headers: XHR });
  if (!res.ok()) {
    throw new Error(`GET ${url} -> ${res.status()}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

async function getProjectId(page, name = MONITOR_PROJECT) {
  const projects = await apiJson(page, "/surveyKPI/myProjectList");
  const project = projects.find((p) => p.name === name);
  if (!project) {
    throw new Error(
      `Project "${name}" not found. Available: ${projects.map((p) => p.name).join(", ")}`
    );
  }
  return project.id;
}

async function getRoleId(page, name = MONITOR_ROLE) {
  const roles = await apiJson(page, "/surveyKPI/role/roles");
  const role = roles.find((r) => r.name === name);
  if (!role) {
    throw new Error(
      `Role "${name}" not found. Available: ${roles.map((r) => r.name).join(", ")}`
    );
  }
  return role.id;
}

/*
 * Upload the XLSForm as a new survey.  Returns { id, ident }.
 *
 * A fresh survey per run is what lets the totals be asserted exactly - its upload_event
 * history starts empty, so the numbers do not accumulate between runs.
 */
async function createSurvey(page, projectId, name) {
  const res = await page.request.post("/surveyKPI/upload/surveytemplate", {
    headers: XHR,
    multipart: {
      templateName: name,
      projectId: String(projectId),
      action: "new",
      file: {
        name: path.basename(MONITOR_FORM),
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: fs.readFileSync(MONITOR_FORM)
      }
    }
  });
  if (!res.ok()) {
    throw new Error(`Survey upload -> ${res.status()}: ${(await res.text()).slice(0, 300)}`);
  }
  // "/surveyKPI/surveys?projectId=" allows Analyst and Enumerator.  The similar looking
  // "/surveyKPI/surveys/project/{id}" does not check project membership, so it is restricted
  // to administrators and owners and 403s for the setup user.
  const surveys = await apiJson(page, `/surveyKPI/surveys?projectId=${projectId}`);
  const survey = surveys.find((s) => s.displayName === name);
  if (!survey) {
    throw new Error(
      `Survey "${name}" not found after upload. Saw: ${surveys.map((s) => s.displayName).join(", ")}`
    );
  }
  return { id: survey.id, ident: survey.ident };
}

/*
 * Read the generated XForm so submissions carry the identifiers the server expects, rather
 * than guessing at the instance root name, form id and version.
 *
 * Takes a basic auth request context, not a page: apache protects /formXML and /submission
 * with AuthType Basic, while /surveyKPI and /app use form auth and a session cookie.
 */
async function getFormMeta(request, surveyIdent) {
  const res = await request.get(`/formXML?key=${encodeURIComponent(surveyIdent)}`);
  if (!res.ok()) {
    throw new Error(`formXML -> ${res.status()}: ${(await res.text()).slice(0, 300)}`);
  }
  const xml = await res.text();
  const match = xml.match(/<instance>\s*<([\w.:-]+)([^>]*)>/);
  if (!match) throw new Error(`Could not find the primary instance in the XForm for ${surveyIdent}`);
  const [, rootName, attrs] = match;
  const idAttr = attrs.match(/\bid="([^"]*)"/);
  const versionAttr = attrs.match(/\bversion="([^"]*)"/);
  return {
    rootName,
    formId: idAttr ? idAttr[1] : surveyIdent,
    version: versionAttr ? versionAttr[1] : null
  };
}

/*
 * Post an ODK submission.  Submitting the same instanceId twice is how the test produces a
 * duplicate, so the caller controls it.
 */
async function submitInstance(request, meta, options) {
  const { instanceId, textValue = "monitor", deviceId } = options;
  const versionAttr = meta.version ? ` version="${meta.version}"` : "";
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<${meta.rootName} id="${meta.formId}"${versionAttr}>` +
    `<text>${textValue}</text>` +
    `<meta><instanceID>${instanceId}</instanceID></meta>` +
    `</${meta.rootName}>`;

  const url = deviceId ? `/submission?deviceID=${encodeURIComponent(deviceId)}` : "/submission";
  const res = await request.post(url, {
    headers: { "X-OpenRosa-Version": "1.0" },
    multipart: {
      xml_submission_file: {
        name: "submission.xml",
        mimeType: "text/xml",
        buffer: Buffer.from(xml, "utf8")
      }
    }
  });
  // 201 created is the OpenRosa success response; a duplicate is still accepted here and
  // only fails later, in the subscriber, which is exactly what the test wants to observe.
  if (res.status() !== 201 && res.status() !== 202) {
    throw new Error(`submission -> ${res.status()}: ${(await res.text()).slice(0, 300)}`);
  }
}

/*
 * GET the monitor totals.  hide is an object such as { success: true }, matching the
 * hide_<status> query parameters the monitor page sends.
 */
async function getTotals(page, options) {
  const { projectId, sName = "_all", groupby, hide = {}, ignoreOld = false } = options;
  const params = new URLSearchParams();
  for (const status of [
    "success",
    "errors",
    "duplicates",
    "merged",
    "not_loaded",
    "upload_errors"
  ]) {
    params.set(`hide_${status}`, hide[status] ? "true" : "false");
  }
  if (groupby) params.set("groupby", groupby);
  if (ignoreOld) params.set("ignore_old_issues", "true");
  const url = `/surveyKPI/eventList/${projectId}/${encodeURIComponent(sName)}/totals?${params}`;
  const body = await apiJson(page, url);
  return (body.features || []).map((f) => f.properties);
}

/*
 * Submissions are applied by the subscriber, so the totals lag the post.  Poll rather than
 * sleep, and fail with the last totals seen so a timeout says what state it reached.
 */
async function waitForTotals(page, options, predicate, timeout = 120000) {
  let last = [];
  await expect
    .poll(
      async () => {
        last = await getTotals(page, options);
        return predicate(last);
      },
      { timeout, message: () => `last totals seen: ${JSON.stringify(last)}` }
    )
    .toBe(true);
  return last;
}

/*
 * The submissions API is the only caller of getSurveyRBACUploadEvent(), so this is where the
 * "not in" to "not exists" rewrite has to be checked.  Basic auth, like /submission.
 */
async function getSubmissions(request, surveyIdent) {
  const res = await request.get(
    `/api/v1/submissions?survey_ident=${encodeURIComponent(surveyIdent)}`
  );
  if (!res.ok()) {
    throw new Error(`submissions api -> ${res.status()}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

/*
 * Soft delete a survey created by a test, so runs do not fill the project's survey list.
 *
 * Note this does not remove the survey from the monitor totals: nothing deletes upload_event
 * rows, and the totals query does not join the survey table, so the counts stay visible.
 * Cleanup is about the survey list, not the monitor.
 */
async function deleteSurvey(page, surveyId) {
  const res = await page.request.delete(`/surveyKPI/survey/${surveyId}`, { headers: XHR });
  if (!res.ok()) {
    throw new Error(`delete survey ${surveyId} -> ${res.status()}`);
  }
}

/*
 * Cleanup must never turn a passing run red, nor hide the real failure in a failing one, so
 * problems here are reported and swallowed.
 */
async function deleteSurveys(page, surveyIds) {
  for (const id of surveyIds) {
    try {
      await deleteSurvey(page, id);
    } catch (e) {
      console.warn(`Cleanup: could not delete survey ${id}: ${e.message}`);
    }
  }
}

async function enableSurveyRole(page, surveyId, roleId) {
  const res = await page.request.post(`/surveyKPI/role/survey/${surveyId}/enabled`, {
    headers: { ...XHR, "Content-Type": "application/x-www-form-urlencoded" },
    form: { role: JSON.stringify({ id: roleId, enabled: true }) }
  });
  if (!res.ok()) {
    throw new Error(`enable survey role -> ${res.status()}: ${(await res.text()).slice(0, 300)}`);
  }
}

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} env var is required`);
  return value;
}

module.exports = {
  SMAP_TEST1_USER,
  SMAP_TEST1_PASSWORD,
  SMAP_TEST2_USER,
  SMAP_TEST2_PASSWORD,
  SMAP_MONITOR_USER,
  SMAP_MONITOR_PASSWORD,
  SMAP_RBAC_YES_USER,
  SMAP_RBAC_YES_PASSWORD,
  SMAP_RBAC_NO_USER,
  SMAP_RBAC_NO_PASSWORD,
  MONITOR_PROJECT,
  MONITOR_ROLE,
  MONITOR_FORM,
  login,
  navigateTo,
  apiJson,
  getProjectId,
  getRoleId,
  createSurvey,
  getFormMeta,
  submitInstance,
  getTotals,
  waitForTotals,
  getSubmissions,
  deleteSurvey,
  deleteSurveys,
  enableSurveyRole,
  requireEnv
};
