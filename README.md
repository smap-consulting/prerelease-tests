# prerelease-tests

Playwright E2E test suite run before each smap release. Tests expect a running smap instance.

## Prerequisites

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

## Tests

| File | Description |
|------|-------------|
| `tests/webserver.spec.js` | Smoke test — verifies page title |
| `tests/submit-case-and-update.spec.js` | Workflow test — login, submit case, verify tracking table, update via oversight form |
