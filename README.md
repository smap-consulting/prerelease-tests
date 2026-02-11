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

#### Users

| Name   | Security Groups |
|--------|-----------------|
| test1  | Enumerator, Manage Console, Manage Data| 

####

| Name | Download Link | Bundle |
|------|---------------|--------|
| main | https://docs.google.com/spreadsheets/d/13stRrE7sddQv2U5hyvwkBH--IpbLTTvQOZ_UiVqRu58/edit?usp=sharing | main |
 | oversight | https://docs.google.com/spreadsheets/d/1ZrH3YfmmV23x0UDu_nXTXm67ZX6Rxvh04j3n3Z_mqd4/edit?usp=sharing  | main |

## Running tests

```bash
npm run test:e2e          # run all tests
npm run test:e2e:ui       # Playwright UI mode
npm run test:e2e:debug    # run with PWDEBUG=1
```

To target a different server:

```bash
SMAP_BASE_URL=https://staging.example.com npm run test:e2e
```

## Regression Tests

| File | Description | Users | Surveys |
|------|-------------|-------|---------|
| `tests/submit-case-and-update.spec.js` | Workflow test — login, submit case, verify tracking table, update via oversight form | test1 | main, oversight |

## Proactive Tests

| File | Description |
