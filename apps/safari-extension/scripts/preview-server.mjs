#!/usr/bin/env node
// Foreground launcher for the P0-07 document preview (owned page, early desktop
// fallback). Serves only the module's own pages on 127.0.0.1 and stops on Ctrl+C.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, startFixtureServer } from './fixture-server.mjs';

const moduleDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await startFixtureServer(moduleDir, { log: (line) => console.log(line) });
console.log(`Document preview: http://127.0.0.1:${PORT}/preview/`);
console.log(`  storage is not connected there; to exercise save/retry/reopen with the labeled in-page test double: http://127.0.0.1:${PORT}/preview/?store=test-double`);
console.log('Press Ctrl+C to stop.');
const stop = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
