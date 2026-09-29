// Static server for the owned probe fixture and the owned document preview page only
// (fixture/, preview/ and dist/), bound to
// 127.0.0.1 on the lead-allocated probe port. Also receives self-test reports
// and can hold the page load event until a report arrives.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

// Keep checks on their lead-allocated port when the user's preview occupies the default.
export const PORT = Number(process.env.LC_WEB_FIXTURE_PORT ?? 4173);
const TYPES = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8', '.json': 'application/json' };

/**
 * `token`: when set, a self-test report is accepted only with this per-run token,
 * and only the first valid report counts.
 * `control` / `controlToken`: check harness only (never the launcher). A POST to
 * /__control/<action>?token=<controlToken> awaits `control(action)`, so a step in a
 * running browser check can stop or restart a local test process at a set point.
 */
export function startFixtureServer(moduleDir, { onReport = () => {}, log = () => {}, token = null, control = null, controlToken = null } = {}) {
  const roots = { '/fixture/': join(moduleDir, 'fixture'), '/preview/': join(moduleDir, 'preview'), '/dist/': join(moduleDir, 'dist') };
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
    if (control && controlToken && url.pathname.startsWith('/__control/') && req.method === 'POST') {
      req.resume();
      if (url.searchParams.get('token') !== controlToken) return res.writeHead(403).end();
      const action = url.pathname.slice('/__control/'.length);
      control(action).then(
        () => res.writeHead(204).end(),
        (error) => {
          log(`control ${action} failed: ${error}`);
          res.writeHead(500).end();
        },
      );
      return;
    }
    const prefix = Object.keys(roots).find((p) => url.pathname.startsWith(p));
    if (!prefix || req.method !== 'GET') return res.writeHead(404).end();
    const base = roots[prefix];
    let relative;
    try {
      relative = decodeURIComponent(url.pathname.slice(prefix.length));
      if (relative === '' || relative.endsWith('/')) relative += 'index.html';
    } catch {
      return res.writeHead(400).end();
    }
    const file = normalize(join(base, relative));
    if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
    const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' };
    // Strict page policy for the CSP probe page: no inline styles or scripts.
    if (url.pathname === '/fixture/csp.html') headers['content-security-policy'] = "default-src 'self'; style-src 'self'; script-src 'self'";
    // The document preview renders user files: the same strict policy as its meta tag. Its only
    // other connection is the local preview API on the lead-allocated loopback port.
    if (file === join(roots['/preview/'], 'index.html')) headers['content-security-policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' http://127.0.0.1:8174; object-src 'none'; base-uri 'none'; form-action 'none'";
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
