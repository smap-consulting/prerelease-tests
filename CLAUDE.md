# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Playwright E2E test suite for the smap web app. Pure JavaScript, no TypeScript.

## Commands

```bash
npm run install:playwright   # install Playwright + browser deps
npm run test:e2e             # run all tests
npm run test:e2e:ui          # Playwright UI mode
npm run test:e2e:debug       # run with PWDEBUG=1
```

## Configuration

- **playwright.config.js**: base URL defaults to `http://localhost:3000`, override with `SMAP_BASE_URL` env var
- Test timeout: 30s, expect timeout: 5s
- Browser: Chromium (Desktop Chrome) only
- Trace captured on first retry

## Architecture

- `tests/webserver.spec.js` — smoke test (title check)
- `tests/submit-case-and-update.spec.js` — main workflow test: login, submit case via myWork, verify in managed_forms tracking table, update with oversight form, verify persistence. Uses polling and dynamic column lookups against the smap DOM.

Tests expect a running smap instance at the base URL. Login credentials are hardcoded in the spec files.
