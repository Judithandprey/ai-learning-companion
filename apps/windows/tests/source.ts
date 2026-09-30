// Source text of this app for tests that run its real functions: read with line endings normalized (a
// Windows checkout has CRLF), so that anchors and replacements match on every platform.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const APP = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');

/** The type-stripped text of `relative` (from apps/windows), with LF line endings. */
export const appSource = (relative: string): string => stripTypeScriptTypes(fs.readFileSync(path.join(APP, relative), 'utf8').replace(/\r\n/g, '\n'));

/** `text` with `from` replaced by `to`; throws when `from` is not there (a silent miss would change what is tested). */
export function replaceOnce(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`the source no longer contains ${JSON.stringify(from)}`);
  return text.replace(from, to);
}
