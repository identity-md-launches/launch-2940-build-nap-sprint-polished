import { readdir, lstat, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const limit=8_388_608;
// The protected and supplied input paths are never read. Scratch is discarded.
const excluded=new Set(['.git','.github','.agents','.codex','.aws','.imd','node_modules','.vite','.cache','coverage']);
async function walk(dir,prefix='') {
  const files=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const name=prefix+entry.name;
    if(excluded.has(entry.name)||entry.name.startsWith('.env')||name==='test/scratch'||entry.name.endsWith('.tsbuildinfo'))continue;
    const path=join(dir,entry.name), stat=await lstat(path);
    assert.equal(stat.isSymbolicLink(),false,`Deliverable must not contain a symlink: ${name}`);
    if(stat.isDirectory())files.push(...await walk(path,name+'/'));
    else files.push({path:name,bytes:stat.size});
  }
  return files;
}
let files=await walk('.');
assert.ok((await readFile('.gitignore')).length<=512,'.gitignore explicit path budget is 512 bytes');
assert.equal(files.some(f=>f.path.endsWith('.tgz')||f.path.endsWith('.zip')||f.path.endsWith('.tar')||f.path==='.gitmodules'),false,'Unnecessary archives or submodules found');
const dist=files.filter(f=>f.path.startsWith('dist/'));
assert.ok(dist.some(f=>f.path==='dist/index.html'),'Production export is required');
assert.equal(dist.some(f=>/\.(?:map|ts|tgz|zip)$/.test(f.path)),false,'Export contains packaging or source-map artifacts');
const html=await readFile('dist/index.html','utf8');
assert.ok(/<title>[^<]+<\/title>/.test(html));
for(const name of ['description','og:title','og:image'])assert.ok(html.includes(`"${name}"`),`Missing ${name}`);
for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url=match[1]; if(url.startsWith('#')||/^https?:/.test(url))continue;
  assert.ok(url.startsWith('./'),`Static HTML URL is not relative: ${url}`);
  await lstat(join('dist',url.split('?')[0]));
}
for(const asset of dist.filter(f=>f.path.endsWith('.css'))) {
  const css=await readFile(asset.path,'utf8');
  for(const match of css.matchAll(/url\((?:["']?)([^)"']+)(?:["']?)\)/g)) {
    const url=match[1];if(url.startsWith('data:'))continue;
    assert.ok(!/^(?:https?:|\/)/.test(url),`CSS runtime asset must be relative: ${url}`);
    await lstat(resolve(dirname(asset.path),url));
  }
}
const png=await readFile('dist/og-image.png');
assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
const manifest={export:'dist/',totalBytes:dist.reduce((n,f)=>n+f.bytes,0),files:await Promise.all(dist.map(async f=>({path:f.path.slice(5),bytes:f.bytes,sha256:createHash('sha256').update(await readFile(f.path)).digest('hex')})))};
await writeFile('artifacts/build-manifest.json',JSON.stringify(manifest,null,2)+'\n');
files=await walk('.');
const total=files.reduce((n,f)=>n+f.bytes,0);
assert.ok(total<=limit,`Delivery is ${total} bytes; maximum is ${limit}`);
const groups=[
  ['dist/**',512*1024,f=>f.path.startsWith('dist/')],
  ['public/**',512*1024,f=>f.path.startsWith('public/')],
  ['src/**',512*1024,f=>f.path.startsWith('src/')],
  ['scripts/**',256*1024,f=>f.path.startsWith('scripts/')],
  ['test/** (excluding discarded scratch)',128*1024,f=>f.path.startsWith('test/')],
  ['artifacts/screenshots/**',2*1024*1024,f=>f.path.startsWith('artifacts/screenshots/')],
  ['other artifacts/**',256*1024,f=>f.path.startsWith('artifacts/')&&!f.path.startsWith('artifacts/screenshots/')],
  ['root files and licenses/**',512*1024,f=>!f.path.includes('/')||f.path.startsWith('licenses/')],
];
const pathBudgets=groups.map(([path,budget,accept])=>{
  const bytes=files.filter(accept).reduce((n,f)=>n+f.bytes,0);
  assert.ok(bytes<=budget,`${path} exceeds its explicit ${budget}-byte path budget`);
  return{path,bytes,limitBytes:budget};
});
console.log(JSON.stringify({passed:true,limitBytes:limit,deliveryBytes:total,headroomBytes:limit-total,fileCount:files.length,exportBytes:manifest.totalBytes,ignoreFileBytes:(await readFile('.gitignore')).length,pathBudgets,largestFiles:[...files].sort((a,b)=>b.bytes-a.bytes).slice(0,8)},null,2));
