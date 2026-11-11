import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,getDocs,collection,deleteDoc,serverTimestamp,Timestamp,setLogLevel} from 'firebase/firestore';
setLogLevel('silent');
let env;const uid='owner',ownerEmail='owner@example.test';
const actor=(id,email=id+'@example.test',verified=true)=>env.authenticatedContext(id,{email,email_verified:verified}).firestore();
const meta=id=>({createdAt:serverTimestamp(),createdBy:id,updatedAt:serverTimestamp(),updatedBy:id,revision:1});
const publisher=id=>({lead:1,cutoff:16,...meta(id)});
const general=id=>({nextDayMode:false,imported:false,...meta(id)});
const adjustment=id=>({id:'event-1',target:'p9',kind:'closed',startAt:Timestamp.fromDate(new Date('2026-11-09T00:00:00Z')),endAt:Timestamp.fromDate(new Date('2026-11-10T00:00:00Z')),reason:'棚卸し',extra:0,...meta(id)});
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-shipping-guide',firestore:{host:'127.0.0.1',port:8085,rules:fs.readFileSync(new URL('./firestore.rules',import.meta.url),'utf8')}})});
after(async()=>{await env?.cleanup()});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,'private','bootstrap'),{ownerEmail});await setDoc(doc(db,'access','editor'),{uid:'editor',role:'editor',...meta('owner')})})});
test('anonymous, unapproved and unverified users cannot read shared data',async()=>{
 for(const db of [env.unauthenticatedContext().firestore(),actor('outsider'),actor('owner',ownerEmail,false)]){await assertFails(getDoc(doc(db,'settings','general')));await assertFails(getDocs(collection(db,'adjustments')))}
 await assertSucceeds(getDoc(doc(actor('outsider'),'access','outsider')));
 await assertFails(getDoc(doc(actor('outsider'),'access','editor')));
});
test('only the bootstrapped owner can grant membership, and cannot grant a second owner',async()=>{
 const root=actor(uid,ownerEmail),editor=actor('editor');
 await assertSucceeds(setDoc(doc(root,'access',uid),{uid,role:'owner',...meta(uid)}));
 await assertSucceeds(setDoc(doc(root,'access','new-editor'),{uid:'new-editor',role:'editor',...meta(uid)}));
 await assertFails(setDoc(doc(editor,'access','intruder'),{uid:'intruder',role:'owner',...meta('editor')}));
 await assertFails(setDoc(doc(root,'access','second-owner'),{uid:'second-owner',role:'owner',...meta(uid)}));
 await assertFails(updateDoc(doc(editor,'access','editor'),{role:'owner',updatedAt:serverTimestamp(),updatedBy:'editor',revision:2}));
 await assertFails(deleteDoc(doc(root,'access',uid)));
});
test('a member can update valid publisher data while types and schemas stay enforced',async()=>{
 const db=actor('editor'),ref=doc(db,'publishers','p9');
 await assertSucceeds(setDoc(ref,publisher('editor')));
 await assertSucceeds(updateDoc(ref,{lead:2,updatedAt:serverTimestamp(),updatedBy:'editor',revision:2}));
 for(const bad of [{lead:'3'},{lead:0},{lead:61},{lead:1.5},{cutoff:15},{extraField:'injected'},{updatedBy:'another-user'},{createdBy:'another-user'},{createdAt:Timestamp.fromMillis(0)},{revision:99}]){
  await assertFails(updateDoc(ref,{updatedAt:serverTimestamp(),updatedBy:'editor',revision:3,...bad}));
 }
 await assertFails(setDoc(doc(db,'publishers','unknown'),publisher('editor')));
 const value=(await getDoc(ref)).data();assert.equal(value.lead,2);assert.equal(value.revision,2);
});
test('required fields cannot be deleted by replacing an existing record',async()=>{
 const db=actor('editor'),ref=doc(db,'publishers','p9');await setDoc(ref,publisher('editor'));const old=(await getDoc(ref)).data();delete old.lead;
 await assertFails(setDoc(ref,{...old,updatedAt:serverTimestamp(),updatedBy:'editor',revision:2}));
});
test('valid adjustments work and unsafe updates fail',async()=>{
 const db=actor('editor'),ref=doc(db,'adjustments','event-1');await assertSucceeds(setDoc(ref,adjustment('editor')));
 await assertSucceeds(updateDoc(ref,{reason:'社内行事',revision:2,updatedAt:serverTimestamp(),updatedBy:'editor'}));
 const badCases=[{reason:'x'.repeat(81)},{reason:''},{reason:7},{kind:'other'},{extra:1},{target:'unknown'},{id:'hijack'},{startAt:'2026-11-09'},{startAt:Timestamp.fromDate(new Date('2026-11-09T12:00:00Z'))},{endAt:Timestamp.fromDate(new Date('2026-11-08T00:00:00Z'))},{endAt:Timestamp.fromDate(new Date('2028-01-01T00:00:00Z'))},{updatedAt:Timestamp.fromDate(new Date('2030-01-01'))},{isAdmin:true}];
 for(const bad of badCases)await assertFails(updateDoc(ref,{revision:3,updatedAt:serverTimestamp(),updatedBy:'editor',...bad}));
 await assertSucceeds(deleteDoc(ref));
});
test('busy-period delays require a manufacturer and bounded integer days',async()=>{
 const db=actor('editor'),base={...adjustment('editor'),kind:'delay',extra:2};
 await assertSucceeds(setDoc(doc(db,'adjustments','event-1'),base));
 for(const values of [{target:'self'},{extra:0},{extra:61},{extra:1.5}])await assertFails(updateDoc(doc(db,'adjustments','event-1'),{revision:2,updatedAt:serverTimestamp(),updatedBy:'editor',...values}));
});
test('next-day mode is shared, and only the owner can confirm initial import',async()=>{
 const root=actor(uid,ownerEmail),db=actor('editor'),ref=doc(root,'settings','general');await assertSucceeds(setDoc(ref,general(uid)));
 await assertSucceeds(updateDoc(doc(db,'settings','general'),{nextDayMode:true,revision:2,updatedAt:serverTimestamp(),updatedBy:'editor'}));
 await assertFails(updateDoc(doc(db,'settings','general'),{imported:true,revision:3,updatedAt:serverTimestamp(),updatedBy:'editor'}));
 await assertSucceeds(updateDoc(ref,{imported:true,revision:3,updatedAt:serverTimestamp(),updatedBy:uid}));
 await assertFails(updateDoc(ref,{imported:false,revision:4,updatedAt:serverTimestamp(),updatedBy:uid}));
 await assertFails(deleteDoc(ref));
});
test('private bootstrap and arbitrary user documents are never client-readable',async()=>{
 for(const db of [actor(uid,ownerEmail),actor('editor')]){await assertFails(getDoc(doc(db,'private','bootstrap')));await assertFails(setDoc(doc(db,'private','bootstrap'),{ownerEmail:'attacker@example.test'}));await assertFails(getDocs(collection(db,'users')))}
});
test('revoking membership removes shared access immediately',async()=>{
 const root=actor(uid,ownerEmail),db=actor('editor');await setDoc(doc(root,'settings','general'),general(uid));await assertSucceeds(getDoc(doc(db,'settings','general')));
 await deleteDoc(doc(root,'access','editor'));await assertFails(getDoc(doc(db,'settings','general')));await assertFails(setDoc(doc(db,'publishers','p9'),publisher('editor')));
});
