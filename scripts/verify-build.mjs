import {readdir,readFile} from 'node:fs/promises';
const traces=[];
async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())await scan(p);else if(e.name.endsWith('.nft.json'))traces.push(p)}}
await scan('.next');
const violations=[];
for(const file of traces){const value=JSON.parse(await readFile(file,'utf8'));for(const asset of value.files??[])if(/(?:^|\/)\.local(?:\/|$)|(?:^|\/)\.env(?:\.|$)|(?:^|\/)\.venv(?:\/|$)/.test(asset))violations.push(file);}
if(violations.length)throw new Error('Private runtime files entered build traces: '+[...new Set(violations)].join(', '));
console.log(`Build trace privacy check passed (${traces.length} manifests; no local data, model downloads or environment files).`);
