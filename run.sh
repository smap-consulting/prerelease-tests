#!/bin/sh

export SMAP_BASE_URL=https://dev.smap.com.au

npm run test:e2e -- --grep "submit case"
npm run test:e2e -- --grep "choices page"
