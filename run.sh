#!/bin/sh

export SMAP_BASE_URL=https://dev.smap.com.au

npm run test:e2e -- --grep "submit case"
npm run test:e2e -- --grep "choices page"
npm run test:e2e -- --grep "create task group"
npx playwright test create-workflow-form.spec.js

# These two submit records and wait for them to be applied, so they need a running subscriber
npm run test:e2e -- --grep "monitor totals"
npm run test:e2e -- --grep "monitor rbac"
