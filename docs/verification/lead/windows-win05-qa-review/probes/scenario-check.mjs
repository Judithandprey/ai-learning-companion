import assert from 'node:assert/strict';
import {scenarios as old} from './old-scenarios.mjs';
import {scenarios as next} from './tests/e2e/windows/scenarios.mjs';
const p={actor:'fixture-actor',courseUrl:'http://fixture.invalid/course',edgeProfile:'fixture-profile'};
const counts={};
for(const key of Object.keys(old)){
 assert.deepEqual(next[key](p),old[key](p),key);
 counts[key]=old[key](p).length;
}
assert.deepEqual(Object.keys(next).filter(k=>!(k in old)),['parentwin05']);
const steps=next.parentwin05(p);
assert.equal(steps.length,76);
assert.equal(steps.filter(s=>s.hostPause).length,2);
assert.equal(steps.filter(s=>s.hostResume).length,2);
assert.equal(steps.filter(s=>s.stroke||s.endHungApp).length,0);
console.log(JSON.stringify({existing_scenarios_byte_equivalent_JSON:counts,parentwin05:{steps:steps.length,pauses:2,resumes:2,strokes:0,force_kills:0}},null,2));
