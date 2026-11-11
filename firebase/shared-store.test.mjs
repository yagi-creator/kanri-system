import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {SharedStore,SharedConflictError} from '../shared-store.mjs';
let env;const running=[];sdk.setLogLevel('silent');
const waitFor=async check=>{const deadline=Date.now()+8000;while(Date.now()<deadline){if(check())return;await new Promise(resolve=>setTimeout(resolve,30))}throw Error('Timed out waiting for shared state')};
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-shipping-guide',firestore:{host:'127.0.0.1',port:8085,rules:fs.readFileSync(new URL('./firestore.rules',import.meta.url),'utf8')}});await env.clearFirestore();await env.withSecurityRulesDisabled(context=>sdk.setDoc(sdk.doc(context.firestore(),'private','bootstrap'),{ownerEmail:'owner@example.test'}))});
after(async()=>{running.forEach(client=>client.store.stop());await env?.cleanup()});
function client(uid){const user={uid,emailVerified:true,displayName:uid};const context=env.authenticatedContext(uid,{email:uid+'@example.test',email_verified:true});const result={state:null,data:null};const clientSdk={...sdk,onAuthStateChanged:(_auth,callback)=>{queueMicrotask(()=>callback(user));return ()=>{}}};result.store=new SharedStore({db:context.firestore(),auth:{currentUser:user},sdk:clientSdk,onState:state=>{result.state=state},onData:data=>{result.data=data}}).start();running.push(result);return result}
test('two editors synchronize settings, detect conflicts, and revoke/regrant access',async()=>{
 const owner=client('owner');await waitFor(()=>owner.state?.state==='connected');assert.equal(owner.state.role,'owner');
 const editor=client('editor');await waitFor(()=>editor.state?.state==='pending');assert.equal(editor.store.ready,false);
 await owner.store.grant('editor');await waitFor(()=>editor.state?.state==='connected');
 await owner.store.setPublisher('p9',2,14);await waitFor(()=>editor.data?.publishers.some(p=>p.id==='p9'&&p.lead===2));
 const stale=owner.store.revision('publishers/p9');await editor.store.setPublisher('p9',3,16);await waitFor(()=>owner.data?.publishers.some(p=>p.id==='p9'&&p.lead===3));
 await assert.rejects(owner.store.setPublisher('p9',4,14,stale),SharedConflictError);
 assert.equal((await sdk.getDoc(sdk.doc(owner.store.db,'publishers','p9'))).data().lead,3);
 await editor.store.setMode(true);await waitFor(()=>owner.data?.general.nextDayMode===true);
 await owner.store.addEvent({id:'test-shared-event',target:'p9',kind:'closed',start:'2026-11-12',end:'2026-11-13',reason:'棚卸し',extra:1});await waitFor(()=>editor.data?.events.some(e=>e.id==='test-shared-event'));
 assert.equal(editor.data.events[0].extra,0);assert.equal(editor.data.events[0].start,'2026-11-12');
 await editor.store.deleteEvent('test-shared-event');await waitFor(()=>owner.data?.events.length===0);assert.equal(owner.store.revision('adjustments/test-shared-event'),0);
 await owner.store.revoke('editor');await waitFor(()=>editor.state?.state==='pending');assert.equal(editor.store.ready,false);
 await assert.rejects(editor.store.setMode(false));
 await owner.store.grant('editor');await waitFor(()=>editor.state?.state==='connected');assert.equal(editor.data.general.nextDayMode,true);
 await assert.rejects(owner.store.importLocal({publishers:[{id:'p9',lead:4,cutoff:14}],events:[],nextDayMode:false}));assert.equal((await sdk.getDoc(sdk.doc(owner.store.db,'settings','general'))).data().imported,false);
 await owner.store.importLocal({publishers:[{id:'p10',lead:2,cutoff:14}],events:[{id:'initial-import-event',target:'self',kind:'closed',start:'2026-11-13',end:'2026-11-13',reason:'社内行事',extra:0}],nextDayMode:false});await waitFor(()=>editor.data.general.imported===true&&editor.data.events.length===1);assert.equal(editor.data.general.nextDayMode,false);assert.ok(editor.data.publishers.some(p=>p.id==='p10'));
 await assert.rejects(owner.store.importLocal({publishers:[],events:[],nextDayMode:false}));

});
