// Static server for the owned probe fixture only (fixture/ and dist/), bound to
// 127.0.0.1 on the lead-allocated probe port. Also receives self-test reports
// and can hold the page load event until a report arrives.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

export const PORT = 4173;
const TYPES = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8', '.json': 'application/json' };

/**
 * `token`: when set, a self-test report is accepted only with this per-run token,
 * and only the first valid report counts.
 */
export function startFixtureServer(moduleDir, { onReport = () => {}, log = () => {}, token = null } = {}) {
  const roots = { '/fixture/': join(moduleDir, 'fixture'), '/dist/': join(moduleDir, 'dist') };
  let reported = false;
  const holds = [];
  const release = () => holds.splice(0).forEach((h) => h.writeHead(204).end());
  const server = createServer((req, res) => {
    try {
      handle(req, res);
    } catch (error) {
      log(`request error: ${error}`);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/__hold') {
      if (reported) return res.writeHead(204).end();
      holds.push(res);
      return;
    }
    if (url.pathname === '/__selftest' && req.method === 'POST') {
      if (reported || (token !== null && url.searchParams.get('token') !== token)) {
        log('rejected self-test report (duplicate or wrong token)');
        req.resume();
        return res.writeHead(403).end();
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          onReport(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          reported = true;
        } catch (error) {
          log(`bad report: ${error}`);
        }
        res.writeHead(204).end();
        // Release the load hold shortly after so the final card state is painted.
        setTimeout(release, 800);
      });
      return;
    }
    const prefix = Object.keys(roots).find((p) => url.pathname.startsWith(p));
    if (!prefix || req.method !== 'GET') return res.writeHead(404).end();
    const base = roots[prefix];
    let relative;
    try {
      relative = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch {
      return res.writeHead(400).end();
    }
    const file = normalize(join(base, relative));
    if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
    const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' };
    // Strict page policy for the CSP probe page: no inline styles or scripts.
    if (url.pathname === '/fixture/csp.html') headers['content-security-policy'] = "default-src 'self'; style-src 'self'; script-src 'self'";
    res.writeHead(200, headers);
    res.end(readFileSync(file));
  }
  return new Promise((ok, fail) =>
    server.once('error', fail).listen(PORT, '127.0.0.1', () =>
      ok({
        close: () => {
          release();
          return new Promise((done) => server.close(() => done()));
        },
        release,
      }),
    ),
  );
}
