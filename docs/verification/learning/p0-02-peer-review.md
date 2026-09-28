# P0-02 web delivery peer review

Review target: `127bd4cb4cb505edf791c5f386bda905dcf1369b`, parent
`91019c3fd548e47aca632136012bb961c4af07cb`, contract 0.1.0. Reviewer: learning
(Astra), 2026-09-28 UTC. Task/role/AGENTS/TEAM and both requirements documents
read at `36d5e7d37d82f7be3d7b525db45e653f52bed68c`; normative specification
remains `e432937`. This is the lead-assigned bounded P0-02 integration review,
not a new product task or full independent semantic/device acceptance.

Result: **six P2 findings**. Normal mode dispatch and provider-disabled labeling
are present, but cancellation, relayed cards and source/time consistency have
counterexamples. Do not promote the existing happy-path results to a blanket
claim that no cancelled or non-ASK path can display a new explanation. The
native-transport race is conditional on a delayed transport; the current owned
fixture uses the unavailable transport. No production source was changed.

## Findings

### F1 — P2: mouse pointer cancellation submits a selection

Target `apps/safari-extension/src/page.ts:688` (through 695; cancellation handling
is only at 700). In ASK, a mouse down sets `pendingText`; a subsequent
`pointercancel` enters the pending-text branch before the cancellation check.
With an existing nonempty native selection it calls `submit`, renders a fixture
card and increments the request count. Expected: an aborted gesture submits
nothing. Reproduced through the exported page handler with DOM/event doubles:
`requests=1`, `mode=NAV`, `cardHidden=false` after mouse down → pointercancel.
The same pen-cancel control produces zero requests. Handle cancellation before
both the pending-text and captured-pointer submission branches. This is an
existing R08/A03 boundary, not a P0-08 requirement.

### F2 — P2: child-frame card relay bypasses ASK and cancellation

Target `apps/safari-extension/src/page.ts:436` (through 453), with relay payload
creation at 507. Any permitted-origin child can post a `card` message naming a
known fixture source/version/text. `isChildFrame` rejects the top page's own
messages but does not establish that the child completed an authorized request.
The card path has no request/ASK epoch, current-mode or source/frame correlation.
In NAV, WRITE and after explicit ASK cancellation, the repro renders a new
fixture explanation while the explanation-request counter remains **zero**.
Thus `requests == intended marks` misses this presentation bypass.

This is not arbitrary HTML execution or a connected-model leak: content is
plain text and the explanation body comes from the local fixture table. It still
violates the probe's explicit-selection boundary. The delivery openly identifies
window messaging as unauthenticated; its report's claim that page-script card
forgery was fixed should be narrowed to the top-page self-post case actually
tested. Keep this out of real pages until extension messaging establishes sender
identity; also correlate replies with the specific authorized, non-revoked
request at final presentation. Merely checking the mode is insufficient because
a legitimately completed ASK restores NAV before its card arrives.

### F3 — P2: adjusted boxes combine old video time with new content/version

Target `apps/safari-extension/src/page.ts:576`, `page.ts:613`, `page.ts:533`, and
`src/dom-capture.ts:262`. `showAdjust` saves only media state from the mark.
Confirmation later re-reads text, page version, viewport and context, while
passing the old `adjustMedia` into the new snapshot. Repro: mark at video 10 s /
source v1; change text and source to v2 and advance video to 25 s; confirm.
The actual submitted selection says **text="new board", source_version=2,
media_position=10**. It is immutable afterward but never represented one
consistent source moment. The existing `ask.adjust_freezes_mark_time` browser
check verifies only the numeric media position, not content/version consistency.

Freeze the relevant source state together at marking, or invalidate/redraw when
the source changes; do not attach old media coordinates to newly sampled text.
Moving the adjustment onto different media likewise needs an explicit policy.
This affects R10/A01 and the existing immutable-anchor requirement.

### F4 — P2, conditional transport path: a late older card overwrites a newer one

Target `apps/safari-extension/src/session.ts:143` (through 150) and
`src/page.ts:534` (through 555). The epoch check precedes the awaited native
bridge call. After it returns, the page presents the result without checking
whether a newer ASK or dismissal superseded it. Using a deferred in-memory native
transport, submit A (change of basis), then B (eigenvector); resolve B first,
then A. The rendered quote changes from **eigenvector back to change of basis**.
Preserve old evidence while preventing stale results from replacing the currently
requested card. Carry presentation generation/cancellation state through the
last await; avoid depending on a later real native bridge to reveal this race.
No actual native provider connection was used to produce this finding.

### F5 — P2: capture wall time is sampled after asynchronous hashing

Target `apps/safari-extension/src/frame.ts:93` (through 103).
`captured_at: clock()` executes after `await sha256Hex(...)`, even though the
snapshot content was obtained earlier. The direct function repro holds the hash
promise while moving the injected clock from 08:00:00 to 08:00:10; the frame
claims capture at **08:00:10**, not snapshot time. This is a controlled delay,
not a measured ten-second real hash latency. Take capture time synchronously
with the source snapshot; keep processing/completion time separate. This is the
existing §3.1 time-alignment rule and needs no new shared contract field.

### F6 — P2: eigenvector fixture is mathematically too strong

Target `apps/safari-extension/src/fixture-data.ts:37`. The fixture says an
eigenvector keeps its direction and only its length is scaled by the eigenvalue.
For `A = diag(-1, 2)`, `v = (1, 0)`, the image is `(-1, 0)`: orientation reverses,
and length does not become negative. A zero eigenvalue sends a nonzero
eigenvector to zero, whose direction is undefined. Prefer: “A nonzero
eigenvector is scaled by its eigenvalue: Av = λv. A negative λ reverses direction;
λ = 0 maps it to zero.” Update the Chinese hint consistently. A synthetic label
does not make incorrect teaching text acceptable. This is one checked
counterexample, not independent acceptance of the rest of the teaching corpus.

## Executed checks, controls and scope limits

The exact target was extracted under `/tmp/learning-p002-review-xHHBx7`, including
its root `package.json`, without changing web/other worktrees. First extraction
omitted that root ESM marker and produced TS1295/TS1287; restoring the committed
file fixed this reviewer-created setup error. No dependency was installed.

- Pinned Node **24.21.0**, TypeScript **7.0.2**, both read-only from the lead repo.
  `scripts/check.sh` typecheck and browser build passed. In this environment its
  isolated `node --test` output counted **7 file wrappers**, not 44 named tests;
  that count alone was not treated as evidence of all 44 test bodies. A direct
  import of all seven original test modules executed **44 tests, 44 pass, 0 fail**.
  The isolated-runner difference was not diagnosed as a web source defect.
- Existing contract evidence revalidated unchanged: **20 CapabilityResult rows**
  and **11 submitted ask bundles**, zero validation problems.
- The appended harness imports the original `installProbe`, `ProbeSession`,
  frame and fixture modules. It reproduces F1–F5, with zero-request multi-touch
  and pen-cancel controls. It uses minimal DOM/event doubles and the probe's
  explicit synthetic-event test option; it is **not** native input, browser
  layout, device, real capture or target-import evidence.
- Historical browser reports were read, not rerun: self-test **42/42**;
  trusted-input report **37 pass**, zero reported failures and **2 not verifiable**
  (`nav.touch_scroll`, `nav.pinch_zoom`), plus three environment rows. Those
  original results remain historical evidence with their stated limits.
- Normal NAV/WRITE input dispatch calls no explanation path; multi-touch abort
  and pen cancellation controls hold. Hash-time cancellation is checked in the
  existing unit suite. F1/F2 identify bypasses outside those successful controls.
- Cards are silent (`audio=false`, `mode=silent`), use text rendering, and only
  exact source/version/text fixtures get fixture explanations; arbitrary text is
  unavailable. There is **no real model cache or provider**, no voice channel,
  native bridge persistence, device verification or universal live overlay.
- Selection user_id describes ownership; selected text/context belongs to the
  registered page source. This probe does not create learner-reasoning or mastery
  observations. Structured learner-versus-website-feedback provenance, teaching
  intent, all-channel disclosure and persistent preference semantics remain
  P0-08/P0-12 dependencies, not required new fields retrofitted into 0.1.0.

Do not mark G1/A01–A03/A26 fully accepted from this review. iPad Safari/Pencil,
packaging, permitted real course frames, real provider/native ACK and persistence,
G7 semantics and real-device paths remain unverified. No browser service was
started, no peer other than lead was contacted, and no paid API/model calls were
made. Existing P0-10 commits and samples were preserved. The lead should assign
the bounded fixes and retain counterexamples before choosing an integration
candidate; this reviewer does not alter web ownership or resume blocked peers.

## Reproduction

Run from the learning worktree. This writes only a fresh temporary directory:

```sh
review_dir=$(mktemp -d /tmp/learning-p002-review-XXXXXX)
git archive 127bd4cb4cb505edf791c5f386bda905dcf1369b package.json apps/safari-extension packages/contracts docs/verification/web | tar -x -C "$review_dir"
python3 - "$review_dir" <<'PY'
from pathlib import Path
import sys
doc = Path('docs/verification/learning/p0-02-peer-review.md').read_text()
script = doc.split('<!-- peer-probes.mjs -->\n```javascript\n', 1)[1].split('\n```', 1)[0]
Path(sys.argv[1], 'peer-probes.mjs').write_text(script + '\n')
PY
cd "$review_dir"
env -u BROWSER bash apps/safari-extension/scripts/check.sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --input-type=module -e "import { readdir } from 'node:fs/promises'; for (const f of (await readdir('./apps/safari-extension/tests')).filter(f => f.endsWith('.test.ts')).sort()) await import('./apps/safari-extension/tests/'+f);"
PYTHONPATH=. /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python apps/safari-extension/scripts/validate_evidence.py docs/verification/web/capabilities.json docs/verification/web/evidence/edge-selftest.json
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node peer-probes.mjs
```

The harness intentionally asserts the **observed defects**, not product success.
Its SHA-256 is `29f175a1dad9280ee0a2f508d31ebbfc1b85033a4638d91d4e38b11e7cbb1cf7`.
Observed output:

```json
{"relay_NAV":{"mode":"NAV","requests":0,"cardHidden":false},"relay_WRITE":{"mode":"WRITE","requests":0,"cardHidden":false},"relay_cancelled":{"mode":"NAV","requests":0,"cardHidden":false},"mouse_cancel":{"requests":1,"mode":"NAV","cardHidden":false},"adjust_mix":{"text":"new board","version":2,"media":10,"currentMedia":25},"multi_touch_control":{"requests":0,"mode":"ASK"},"pen_cancel_control":{"requests":0,"mode":"ASK"},"late_card":{"current":"Selected: “eigenvector”","late":"Selected: “change of basis”"},"capture_clock":{"snapshotAt":"2026-09-28T08:00:00Z","capturedAt":"2026-09-28T08:00:10Z"}}
```

<!-- peer-probes.mjs -->
```javascript
// Minimal DOM/event doubles exercise the ORIGINAL exported page handler.
// They are not browser, pointer-routing or visual evidence.
import assert from 'node:assert/strict';
import { installProbe, CHANNEL } from './apps/safari-extension/src/page.ts';
import { ProbeSession } from './apps/safari-extension/src/session.ts';
import { unavailableTransport } from './apps/safari-extension/src/bridge.ts';
import { FIXTURE_EXPLANATIONS, SYNTHETIC_IDENTITY, resolveFixtureSource } from './apps/safari-extension/src/fixture-data.ts';
import { counterIds, snapshot } from './apps/safari-extension/tests/helpers.ts';

const rect = {x:100,y:200,left:100,top:200,right:400,bottom:240,width:300,height:40};
class Target {
  listeners = new Map();
  addEventListener(k, fn) {const fs=this.listeners.get(k) ?? []; fs.push(fn); this.listeners.set(k,fs);}
  removeEventListener(k,fn) {this.listeners.set(k,(this.listeners.get(k) ?? []).filter(f=>f!==fn));}
  fire(type, values={}) {for(const f of this.listeners.get(type) ?? []) f({type,isTrusted:false,preventDefault(){},stopImmediatePropagation(){},stopPropagation(){},composedPath(){return [];},...values});}
}
class ElementDouble extends Target {
  constructor(tag='div') {super(); this.tagName=tag.toUpperCase();this.style={};this.dataset={};this.children=[];this.hidden=false;this.textContent='';this.isConnected=true;}
  setAttribute() {}
  append(...nodes){this.children.push(...nodes);}
  attachShadow(){return new ElementDouble('shadow');}
  getContext(){return null;}
  getBoundingClientRect(){return this.tagName==='LC-WEB-PROBE' ? {...rect,left:0,top:0,x:0,y:0} : rect;}
  getClientRects(){return [rect];}
  contains(node){return this===node || this.children.some(n=>n===node || n.contains?.(node));}
  closest(selector){return selector.startsWith('script,') ? null : this;}
  querySelectorAll(){return this.children.flatMap(n=>[n,...(n.querySelectorAll?.('*') ?? [])]);}
  remove(){}
}
globalThis.HTMLElement=ElementDouble;
globalThis.Node={TEXT_NODE:3,ELEMENT_NODE:1};
globalThis.NodeFilter={SHOW_TEXT:4};
globalThis.HTMLMediaElement={HAVE_NOTHING:0};
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
function setup(transport=unavailableTransport) {
  const doc=new Target(), win=new Target(), nodes=[];
  doc.documentElement=new ElementDouble('html');doc.documentElement.clientWidth=1000;doc.documentElement.clientHeight=800;
  const block=new ElementDouble('p');block.innerText='A change of basis changes coordinates.';
  const node={nodeType:3,textContent:'change of basis',parentElement:block,isConnected:true};
  doc.body=block;
  doc.createElement=tag=>{const e=new ElementDouble(tag);nodes.push(e);return e;};
  const range=()=>({commonAncestorContainer:node,startContainer:node,endContainer:node,startOffset:0,endOffset:node.textContent.length,
    getClientRects:()=>[rect],getBoundingClientRect:()=>rect,cloneRange:range,setStart(){},setEnd(){}});
  doc.createRange=range;
  doc.createTreeWalker=()=>{let used=false;return {nextNode(){if(used)return null;used=true;return node;}};};
  doc.elementFromPoint=()=>block;
  const video={getBoundingClientRect:()=>rect,querySelectorAll:()=>[],textTracks:[],readyState:2,currentSrc:'synthetic.webm',srcObject:null,error:null,currentTime:10,paused:false};
  doc.querySelectorAll=tag=>tag==='video'?[video]:[];
  const child={postMessage(){}};
  Object.assign(win,{document:doc,parent:null,frames:[child],devicePixelRatio:1,innerWidth:1000,innerHeight:800,scrollX:0,scrollY:0,
    location:{href:'http://localhost:4173/fixture/index.html'},CSSStyleSheet:class {replaceSync(){}},
    getSelection:()=>({isCollapsed:false,rangeCount:1,getRangeAt:range})});
  win.parent=win;
  let version='1';
  const session=new ProbeSession({identity:SYNTHETIC_IDENTITY,ids:counterIds(),clock:()=>new Date().toISOString(),transport,
    fixtures:FIXTURE_EXPLANATIONS,resolveSource:resolveFixtureSource,projectId:null,knowledgeProfileVersion:1});
  const events=[];
  const ui=installProbe({win,session,documentVersion:()=>version,role:'top',peerOrigins:['http://localhost:4173'],acceptSyntheticEvents:true,onEvent:e=>events.push(e)});
  const pointer=(type,extra={})=>win.fire(type,{pointerId:1,pointerType:'mouse',isPrimary:true,clientX:120,clientY:220,...extra});
  return {win,session,ui,child,events,nodes,node,video,pointer,setVersion:v=>version=v};
}
const results={};
for(const mode of ['NAV','WRITE','cancelled']) {
  const p=setup();
  if(mode==='cancelled'){p.session.press('ASK');p.session.cancelAsk();}else p.session.press(mode);
  p.win.fire('message',{source:p.child,origin:'http://localhost:4173',data:{channel:CHANNEL,type:'card',provenance:'fixture',source_id:'web-probe-fixture',source_version:1,selected_text:'change of basis'}});
  assert.equal(p.ui.cardSnapshot().hidden,false);
  assert.equal(p.session.explanationRequestCount,0);
  results[`relay_${mode}`]={mode:p.session.state.mode,requests:0,cardHidden:p.ui.cardSnapshot().hidden};
}
{
  const p=setup();p.session.press('ASK');p.pointer('pointerdown');p.pointer('pointercancel');await tick();
  assert.equal(p.session.explanationRequestCount,1);
  results.mouse_cancel={requests:p.session.explanationRequestCount,mode:p.session.state.mode,cardHidden:p.ui.cardSnapshot().hidden};
}
{
  const p=setup();p.session.press('ASK');
  p.pointer('pointerdown',{pointerType:'pen',clientX:245,clientY:190});
  p.pointer('pointermove',{pointerType:'pen',clientX:250,clientY:250});
  p.pointer('pointerup',{pointerType:'pen',clientX:250,clientY:250});
  assert(p.events.some(e=>e.type==='adjust'));
  p.video.currentTime=25;p.node.textContent='new board';p.setVersion('2');
  // Confirm the original adjustment after playback and source content changed.
  p.nodes.find(n=>n.className==='confirm').fire('click');await tick();
  const out=p.events.find(e=>e.type==='ask'&&e.outcome==='submitted').detail;
  assert.equal(out.selection.source_version,2);
  assert.equal(out.selection.media_position,10);
  assert.equal(out.selection.selected_text,'new board');
  results.adjust_mix={text:out.selection.selected_text,version:out.selection.source_version,media:out.selection.media_position,currentMedia:p.video.currentTime};
}
{
  const p=setup();p.session.press('ASK');
  p.pointer('pointerdown',{pointerType:'touch'});
  p.pointer('pointerdown',{pointerId:2,pointerType:'touch',isPrimary:false});
  p.pointer('pointerup',{pointerType:'touch'});await tick();
  assert.equal(p.session.explanationRequestCount,0);
  results.multi_touch_control={requests:0,mode:p.session.state.mode};
  p.session.cancelAsk();p.session.press('ASK');
  p.pointer('pointerdown',{pointerType:'pen'});p.pointer('pointercancel',{pointerType:'pen'});await tick();
  assert.equal(p.session.explanationRequestCount,0);
  results.pen_cancel_control={requests:0,mode:p.session.state.mode};
}
{
  const waiting=[];
  const p=setup({kind:'native',send:request=>new Promise(resolve=>waiting.push({request,resolve}))});
  p.session.press('ASK');p.pointer('pointerdown');p.pointer('pointerup');await tick();
  assert.equal(waiting.length,1);
  p.node.textContent='eigenvector';
  p.session.press('ASK');p.pointer('pointerdown');p.pointer('pointerup');await tick();
  const ack=i=>waiting[i].resolve({contract_version:'0.1.0',request_id:waiting[i].request.request_id,status:'accepted',error_code:null});
  ack(1);await tick();const current=p.ui.cardSnapshot().quote;
  ack(0);await tick();const late=p.ui.cardSnapshot().quote;
  assert(current.includes('eigenvector'));assert(late.includes('change of basis'));
  results.late_card={current,late};
}
{
  // No DOM double: original snapshot function + a delayed SHA digest expose clock ordering.
  const {freezeDomSnapshot}=await import('./apps/safari-extension/src/frame.ts');
  let release;let now='2026-09-28T08:00:00Z';
  const original=globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  globalThis.crypto.subtle.digest=(...args)=>new Promise(resolve=>{release=()=>resolve(original(...args));});
  const pending=freezeDomSnapshot(snapshot(),SYNTHETIC_IDENTITY,{source_id:'source',source_version:1,source_timezone:'UTC'},counterIds(),()=>now);
  now='2026-09-28T08:00:10Z';release();const out=await pending;
  globalThis.crypto.subtle.digest=original;
  results.capture_clock={snapshotAt:'2026-09-28T08:00:00Z',capturedAt:out.frame.captured_at};
  assert.equal(out.frame.captured_at,now);
}
console.log(JSON.stringify(results,null,2));
```
