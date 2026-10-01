import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {scenarios as old} from './parent-scenarios.mjs';
import {scenarios as current} from './scenarios.mjs';
const input={courseUrl:'file:///synthetic-course',notes:'synthetic-notes',edgeProfile:'synthetic-edge',userData:'synthetic-userdata',actor:{user_id:'synthetic-actor',device_id:'synthetic-device',session_id:'synthetic-session',producer_id:'synthetic-producer'}};
const rows=[];
for(const name of Object.keys(old)){assert.deepEqual(current[name](input),old[name](input));rows.push({scenario:name,steps:old[name](input).length,identical:true});}
const added=current.parentfix(input);assert.equal(added.length,223);assert.equal(added.some(s=>s.endHungApp),false);
const result={existing:rows,parentfix:{steps:added.length,closeRequests:added.filter(s=>s.closeApp).length,launches:added.filter(s=>s.launchApp).length,forceKillSteps:added.filter(s=>s.endHungApp).length}};
writeFileSync('/tmp/lc-windows-qa-6a3611e/scenario-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
