import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
const tree = new Map(fs.readFileSync('/tmp/windows-retention-correction-sample-git-tree.txt','utf8').trim().split('\n').map(l => { const [meta,p] = l.split('\t'); return [p, meta.split(' ')[2]]; }));
const blob = b => crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const base = '/tmp/windows-retention-e586b82/docs/verification/web/evidence/windows-retention-sample';
const repo = '/home/agentsdock/Projects/learning-companion/repo';
const commit = 'e586b822f81867ecab29ddaeccf5537a40b9f653';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function decode(b) {
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let off = 8, head, compressed = [], ended = false;
  while (off < b.length) {
    const len = b.readUInt32BE(off), type = b.toString('ascii', off+4, off+8);
    assert.ok(off+12+len <= b.length);
    assert.equal(zlib.crc32(b.subarray(off+4, off+8+len)), b.readUInt32BE(off+8+len));
    if (type === 'IHDR') { assert.equal(len, 13); head = b.subarray(off+8, off+8+len); }
    if (type === 'IDAT') compressed.push(b.subarray(off+8, off+8+len));
    if (type === 'IEND') { assert.equal(len, 0); ended = true; }
    off += 12+len;
    if (ended) break;
  }
  assert.equal(off, b.length); assert.ok(ended && head && compressed.length);
  const w = head.readUInt32BE(0), h = head.readUInt32BE(4);
  assert.deepEqual([...head.subarray(8)], [8,6,0,0,0], 'supported exact sample PNG format: RGBA8 noninterlaced');
  const packed = zlib.inflateSync(Buffer.concat(compressed));
  const stride = w*4;
  assert.equal(packed.length, h*(stride+1));
  const rgba = Buffer.alloc(h*stride);
  const filters = new Set();
  for (let y=0; y<h; y++) {
    const f=packed[y*(stride+1)], src=y*(stride+1)+1, dst=y*stride;
    assert.ok(f>=0 && f<=4); filters.add(f);
    for(let x=0; x<stride; x++) {
      const a=x>=4?rgba[dst+x-4]:0, c=x>=4&&y>0?rgba[dst-stride+x-4]:0, up=y>0?rgba[dst-stride+x]:0;
      let pred=0;
      if(f===1) pred=a;
      if(f===2) pred=up;
      if(f===3) pred=Math.floor((a+up)/2);
      if(f===4) {const p=a+up-c, pa=Math.abs(p-a), pb=Math.abs(p-up), pc=Math.abs(p-c); pred=pa<=pb&&pa<=pc?a:pb<=pc?up:c;}
      rgba[dst+x]=(packed[src+x]+pred)&255;
    }
  }
  return { width:w,height:h,rgba_bytes:rgba.length,pixels_sha256:sha(rgba),filters:[...filters].sort() };
}
const mb=fs.readFileSync(path.join(base,'manifest.jsonl'));
const lines=mb.toString('utf8').trim().split('\n').map(l=>JSON.parse(l));
const files=fs.readdirSync(path.join(base,'frames')).sort();
const entries={};
for (const name of files) {
  const b=fs.readFileSync(path.join(base,'frames',name));
  const h=sha(b); assert.equal(name, h+'.png');
  const rel='docs/verification/web/evidence/windows-retention-sample/frames/'+name;
  assert.equal(blob(b), tree.get(rel));
  entries['frames/'+name]={sha256:h,bytes:b.length,...decode(b)};
}
assert.equal(blob(mb),tree.get('docs/verification/web/evidence/windows-retention-sample/manifest.jsonl'));
const referenced=new Set();
for (const l of lines.filter(l=>l.kind==='retained')) {
  // R2: these are independently rounded measurements; do not assert exact subtraction.
  assert.ok(Date.parse(l.sampled_at)>=Date.parse(l.taken_at));
  for (const k of ['raw','composed']) {
    const p=l[k], actual=entries[p.file]; assert.ok(actual); referenced.add(p.file);
    for(const key of ['sha256','bytes','width','height','pixels_sha256']) assert.equal(actual[key],p[key],`sample ${l.sample_seq} ${k}.${key}`);
  }
}
assert.deepEqual([...referenced].sort(),Object.keys(entries).sort());
const result={commit,manifest_sha256:sha(mb),manifest_bytes:mb.length,lines:lines.length,retained:lines.filter(l=>l.kind==='retained').map(l=>l.sample_seq),refused:lines.filter(l=>l.kind==='refused').map(l=>l.sample_seq),not_retained:lines.filter(l=>l.kind==='not_retained'),ended:lines.at(-1),files:entries,total_png_bytes:Object.values(entries).reduce((s,e)=>s+e.bytes,0),result:'All 7 complete PNGs decode; file hashes, byte sizes, RGBA hashes, dimensions, references, wall ordering agree; clock arithmetic is not asserted; 8 raw Git blobs match exactly.'};
fs.writeFileSync('/tmp/windows-retention-correction-sample-audit.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
