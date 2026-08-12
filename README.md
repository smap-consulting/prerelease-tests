# Prerelease Tests

Playwright E2E test suite run before each smap release. Tests expect a running smap instance.  The Smap policy on end to end pre-release test scripts, as of January 2026,
is to create a test after every regressed issue that makes it into production. So a regression should only happen once.  Proactive tests can also be added.  
End to end tests are preferred over unit tests
so each test will cover a broad range of features.

# Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A running smap instance (defaults to `http://localhost:3000`, override with `SMAP_BASE_URL` env var)

## Setup

### Install

```bash
npm install
npm run install:playwright
```

### Resources

The following users and surveys are referenced in the scripts.  Refer to
the script list below for the specific resources required by each script.

#### Projects

| Name         |
|--------------|
| Test         |
| Monitor Test |

#### Users

| Name           | Security Groups                                  | Projects     | Notes |
|----------------|--------------------------------------------------|--------------|-------|
| test1          | Enumerator, Manage Console, Manage Data, Analyst | Test         | |
| test2          | Administrator                                    | Test         | |
| test_monitor   | Analyst, Enumerator, Security Manager            | Monitor Test | Sets up the monitor tests - see below |
| test_rbac_yes  | Analyst, Manage Data                             | Monitor Test | Needs API access enabled. Grant the `prerelease_rbac` role |
| test_rbac_no   | Analyst, Manage Data                             | Monitor Test | Needs API access enabled. Do **not** grant any role |

`test_monitor` exists so the monitor tests do not need extra privilege added to `test1`, which
the other specs share. It is confined to the Monitor Test project and needs:

*  **Analyst** to upload a survey, and membership of Monitor Test - the project list is
   filtered by membership, the upload checks access to the target project, and the monitor
   totals query joins through `user_project`, so a non-member sees nothing whatever their
   security groups
*  **Enumerator** to submit records
*  **Security Manager** only for `monitor rbac`, which enables a role on the survey it creates.
   Both role endpoints require Security Manager or Organisational Administrator - plain
   Administrator does *not* satisfy them, it is a separate group. `monitor totals` touches no
   roles, so it would run without this.

It does not need API access - it never calls the data API.

The two RBAC users do need API access enabled, since the RBAC check runs against
`/api/v1/submissions`. Neither may be an Administrator: an administrator bypasses record level
RBAC, so the negative case would pass for the wrong reason.

#### Roles

| Name             | Granted to    | Used by |
|------------------|---------------|---------|
| prerelease_rbac  | test_rbac_yes | monitor rbac |

The `monitor rbac` test enables this role on a survey it creates, so nothing needs attaching
to a survey by hand.

#### Forms

Add these forms to project test

| Name | Download Link | Bundle | Project |
|------|---------------|--------|---------|
| main | https://docs.google.com/spreadsheets/d/13stRrE7sddQv2U5hyvwkBH--IpbLTTvQOZ_UiVqRu58/edit?usp=sharing | main | Test |
| oversight | https://docs.google.com/spreadsheets/d/1ZrH3YfmmV23x0UDu_nXTXm67ZX6Rxvh04j3n3Z_mqd4/edit?usp=sharing  | main | Test |
| edit_test | https://docs.google.com/spreadsheets/d/1zEx7U-KHZv053FLaRsNsofiwAjRgbUPkSyIFDnIDnGQ/edit?usp=sharing | | Test |

The monitor tests need no form set up by hand. They upload `monitor-test-form.xlsx` from the
repository root as a new survey on each run, so the upload event history they count starts
empty and the expected totals can be exact.

## Running tests

```bash
npm run test:e2e          # run all tests
npm run test:e2e:ui       # Playwright UI mode
npm run test:e2e:debug    # run with PWDEBUG=1
npm run test:e2e -- --grep "submit case"  # run the submit case and update test
npm run test:e2e -- --grep "choices page" # run the edit choice list test
npm run test:e2e -- --grep "create task group" # run the task group creation test
npm run test:e2e -- --grep "monitor totals"    # run the monitor totals test
npm run test:e2e -- --grep "monitor rbac"      # run the monitor RBAC test
```

The monitor tests need a **running subscriber**. They submit records and wait for the
subscriber to apply them, so with it stopped every totals assertion times out.

They create surveys as they go and soft delete them afterwards, pass or fail, so the Monitor
Test survey list does not fill up. Note this clears the survey list only: nothing deletes
`upload_event` rows, and the monitor totals do not join the survey table, so each run's counts
stay visible on the monitor page for good. That is by design - the upload history is the
record of what was submitted - but it does mean the `_all` totals in that project grow over
time.

### Checks that cannot be made through the app

`monitor rbac` covers the happy path of the survey RBAC filter. The specific defect it was
written for - a null `survey_role.survey_ident`, which made the old `not in` return null for
every row and hid roleless surveys from everybody - cannot be created through the UI. Check it
with SQL against `survey_definitions`:

```sql
select count(*) from survey_role where survey_ident is null;   -- expect 0
```

Duplicate project memberships inflate every monitor total, and there is no unique constraint
preventing them:

```sql
select u_id, p_id, count(*) from user_project group by u_id, p_id having count(*) > 1;
```

To target a different server:

```bash
SMAP_BASE_URL=https://staging.example.com npm run test:e2e
```

To set usernames and passwords:

```bash
export SMAP_TEST1_USER="test1"
export SMAP_TEST1_PASSWORD="*******"
export SMAP_TEST2_USER="test2"
export SMAP_TEST2_PASSWORD="*******"
export SMAP_MONITOR_USER="test_monitor"
export SMAP_MONITOR_PASSWORD="*******"
export SMAP_RBAC_YES_USER="test_rbac_yes"
export SMAP_RBAC_YES_PASSWORD="*******"
export SMAP_RBAC_NO_USER="test_rbac_no"
export SMAP_RBAC_NO_PASSWORD="*******"
```

The monitor tests also accept `SMAP_MONITOR_PROJECT` (default `Monitor Test`) and
`SMAP_MONITOR_ROLE` (default `prerelease_rbac`).

## Regression Tests

| File | Description |
|------|-------------|
| `tests/submit-case-and-update.spec.js` | Workflow test — login, submit case, verify tracking table, update via oversight form |
| `tests/editor-choices-page.spec.js` | Check that choice lists can be edited in the online editor — login, open survey in editor, view choices |
| `tests/create-task-group.spec.js` | Create a new task group using the task management page. |

## Proactive Tests

| File | Description                                                                                                                                      |
|------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/create-workflow-form.spec.js` | Add an email task using the workflow interface and confirm that the target survey can be made the same as the triggering survey                  | 
| `tests/monitor-totals.spec.js` | Checks that total submissions reported in the monitor are correct                                                                                | 
| `tests/monitor-rbac.spec.js` | Checks that role based access control is used correctly to filter which surveys are included in the totals on the monitor page | 
