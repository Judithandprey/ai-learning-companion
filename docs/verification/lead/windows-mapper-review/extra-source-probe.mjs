import fs from 'node:fs';
import { frameRequest } from '/tmp/lc-windows-mapper-80da708/apps/windows/src/shared/frame-ingress.ts';
const dir='/tmp/lc-windows-mapper-80da708/docs/verification/web/evidence/';
const meta=JSON.parse(fs.readFileSync(dir+'windows-frame-ingress/native.json','utf8'));
const text=fs.readFileSync(dir+meta.manifest,'utf8');
// SourceRef is a structural type: an object with these exact identity fields and an extra
// harmless property remains assignable. The mapper copies the extra member into closed wire objects.
meta.plan.source={...meta.plan.source, source_timezone:'UTC'};
const result=frameRequest(text,meta.plan);
fs.writeFileSync('/tmp/windows-mapper-review-cases/source-extra-field.json',result.body);
console.log('mapper accepted SourceRef with source_timezone and copied it to record/frame source; Python validation is separate');
