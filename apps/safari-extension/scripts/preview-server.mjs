#!/usr/bin/env node
// Foreground launcher for the P0-07 document preview (owned page, early desktop
// fallback). Serves only the module's own pages on 127.0.0.1 and stops on Ctrl+C.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, startFixtureServer } from './fixture-server.mjs';

const moduleDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await startFixtureServer(moduleDir, { log: (line) => console.log(line) });
console.log(`Document preview: http://127.0.0.1:${PORT}/preview/`);
console.log('  Saving and reopening use the local preview API (services/api/PREVIEW.md). Start it separately in');
console.log(`  the foreground with LC_PREVIEW_UI_ORIGIN=http://127.0.0.1:${PORT} and your LC_PREVIEW_TOKEN, then enter`);
console.log('  that token on the page. It is kept in page memory only.');
console.log(`  Labeled in-page test double (not persistent), for UI checks only: http://127.0.0.1:${PORT}/preview/?store=test-double`);
console.log('Press Ctrl+C to stop.');
const stop = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
