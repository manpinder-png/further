import ts from 'typescript';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const roots=['app','components','lib','domains'];
const files=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.posix.join(dir,e.name);if(e.isDirectory())await walk(p);else if(/\.(ts|tsx)$/.test(p))files.push(p)}}
for(const root of roots)await walk(root);
const known=new Set(files),imports=[];
for(const file of files){const source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true);for(const n of source.statements){if(!ts.isImportDeclaration(n)||!ts.isStringLiteral(n.moduleSpecifier))continue;const spec=n.moduleSpecifier.text;let base=spec.startsWith('@/')?spec.slice(2):spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)):null;if(!base)continue;base=base.replace(/\.tsx?$/,'');const target=[base+'.ts',base+'.tsx',base+'/index.ts',base+'/index.tsx'].find(x=>known.has(x));if(target)imports.push({from:file,to:target,typeOnly:!!n.importClause?.isTypeOnly});}}
const domains=[{id:'ui',paths:['components/','app/page.tsx','app/profile/','app/session/','lib/client/']},{id:'backend',paths:['app/api/','domains/backend/']},{id:'agents',paths:['domains/agents/']},{id:'data',paths:['domains/data/']},{id:'retrieval',paths:['domains/retrieval/']},{id:'shared',paths:['lib/']}];
const classify=f=>domains.find(d=>d.paths.some(p=>f.startsWith(p)))?.id??'ui';
const pairs=new Map();for(const edge of imports){const a=classify(edge.from),b=classify(edge.to);if(a===b)continue;const key=a+'>'+b;pairs.set(key,(pairs.get(key)??0)+1)}
const graph={generatedAt:new Date().toISOString(),generator:'scripts/dependency-map.mjs',sourceFiles:files.length,localImports:imports.length,domains:domains.map(({id})=>({id,fileCount:files.filter(f=>classify(f)===id).length})),domainEdges:[...pairs].map(([key,count])=>({from:key.split('>')[0],to:key.split('>')[1],count})),files,imports};
await writeFile('docs/dependency-map.json',JSON.stringify(graph,null,2)+'\n');console.log(`Dependency map: ${files.length} source files, ${imports.length} local imports`);
