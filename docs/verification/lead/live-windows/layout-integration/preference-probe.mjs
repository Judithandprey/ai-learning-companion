import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { harness, settle, quitLinks } from '/tmp/windows-layout-28f0504/apps/windows/tests/main-harness.ts';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-layout-pref-review-'));
try {
  const file=path.join(dir,'overlay-preferences.json');
  fs.writeFileSync(file+'.unreadable','first torn preferences');
  fs.writeFileSync(file,'second torn preferences');
  harness({userData:dir});
  await settle();
  const result={kind:'Linux actual main source with fake Electron; no window/device/connector', first_backup:'first torn preferences', after:fs.readFileSync(file+'.unreadable','utf8'), primary_exists:fs.existsSync(file)};
  assert.equal(result.after,'second torn preferences');
  assert.equal(result.primary_exists,false);
  console.log(JSON.stringify(result,null,2));
} finally { await quitLinks(); fs.rmSync(dir,{recursive:true,force:true}); }
