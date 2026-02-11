# Prerelease Tests

Playwright E2E test suite run before each smap release. Tests expect a running smap instance.  The Smap policy on end to end pre-release test scripts, as of January 2026,
is to create a test after every regressed issue that makes it into production. So a regression should only happen once.  Proactive tests can also be added.  
End to end tests are preferred over unit tests
so each test will cover a broad range of features.

# Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A running smap instance (defaults to `http://localhost:3000`, override with `SMAP_BASE_URL` env var)

## Setup

```bash
npm install
npm run install:playwright
```

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

| File | Description |
|------|-------------|
| `tests/submit-case-and-update.spec.js` | Workflow test — login, submit case, verify tracking table, update via oversight form |

## Proactive Tests

| File | Description |
