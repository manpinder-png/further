import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathFor} from '../lib/insight.ts';
import {replay} from '../lib/math.ts';
import {personName,STATE_LABEL} from '../lib/client/format.ts';
import type {FEvent} from '../lib/types.ts';
const concepts={gpu:{slug:'gpu',title:'GPU',hook:'Parallel work',domain:'ai-tech'},memory:{slug:'memory',title:'Memory',hook:'Supply data',domain:'ai-tech'}};
test('successful explanation advances the path rather than asking to finish it again',()=>{
 const events:FEvent[]=[{id:1,slug:'gpu',kind:'explain',at:1000,payload:{score:3}},{id:2,slug:'memory',kind:'seed',at:1001}];
 const steps=pathFor(concepts,[{src:'gpu',dst:'memory',kind:'prerequisite'}],replay(events),[],1002,events);
 assert.equal(steps[0].slug,'memory');
 assert.equal(steps.some(s=>s.slug==='gpu'&&s.kind==='finish'),false);
 assert.equal(STATE_LABEL.understood,'Explained');
});
test('partial explanation recommends application and review with no completion promise',()=>{
 const events:FEvent[]=[{id:1,slug:'gpu',kind:'explain',at:1000,payload:{score:1}}];
 const steps=pathFor(concepts,[],replay(events),[],1002,events);
 assert.match(steps[0].reason,/example/);
 assert.doesNotMatch(steps[0].reason,/to finish/);
});
test('peer IDs resolve only from authorized projection and never leak into display fallback',()=>{
 const id='13f672bb-3008-44d9-8a6f-d042eea290d4';
 assert.equal(personName(id,{[id]:'Learning partner'}),'Learning partner');
 assert.equal(personName(id),'a peer');
 assert.equal(personName('Rhea (seed)'),'Rhea');
});
