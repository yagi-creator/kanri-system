import assert from 'node:assert/strict';
import fs from 'node:fs';
import {holidays,schedule,addBusiness,closedReason,monday} from './engine.mjs';
const p={id:'test',lead:1,cutoff:16,direct:true,warehouse:true};
const event=(target,start,end=start,kind='closed',extra=0)=>({target,start,end,kind,extra,reason:'テスト'});
let s=schedule(p,'2026-11-05','12:00');assert.equal(s.direct,'2026-11-06');assert.equal(s.home,'2026-11-09');
s=schedule(p,'2026-11-05','12:00',[event('self','2026-11-09')]);assert.equal(s.direct,'2026-11-06');assert.equal(s.arrival,'2026-11-06');assert.equal(s.home,'2026-11-10');
s=schedule(p,'2026-11-05','12:00',[event('test','2026-11-06')]);assert.equal(s.direct,'2026-11-09');assert.equal(s.home,'2026-11-10');
s=schedule(p,'2026-11-05','12:00',[event('other','2026-11-06')]);assert.equal(s.direct,'2026-11-06');
s=schedule(p,'2026-11-05','16:00');assert.equal(s.direct,'2026-11-06');s=schedule(p,'2026-11-05','16:01');assert.equal(s.direct,'2026-11-09');
s=schedule({...p,cutoff:14},'2026-11-05','14:01');assert.equal(s.direct,'2026-11-09');
s=schedule(p,'2026-11-21','12:00');assert.equal(s.accepted,'2026-11-24');assert.equal(s.direct,'2026-11-25');
s=schedule(p,'2026-11-05','12:00',[event('test','2026-11-05','2026-11-05','delay',2)]);assert.equal(s.direct,'2026-11-10');assert.equal(s.extra,2);
s=schedule(p,'2026-11-05','12:00',[event('test','2026-11-06','2026-11-10')]);assert.equal(s.direct,'2026-11-11');
assert.equal(holidays(2026).get('2026-09-22'),'国民の休日');assert.equal(holidays(2026).get('2026-05-06'),'振替休日');assert.equal(holidays(2027).get('2027-03-22'),'振替休日');assert.equal(holidays(2025).get('2025-02-24'),'振替休日');
assert.equal(addBusiness('2026-12-31',1,'self').date,'2027-01-04');assert.equal(monday('2026-11-08'),'2026-11-02');
// Cutoff forwarding starts from the order date, not from an already-forwarded holiday.
assert.equal(schedule(p,'2026-11-06','16:00:00').accepted,'2026-11-06');
assert.equal(schedule(p,'2026-11-06','16:00:01').accepted,'2026-11-09');
assert.equal(schedule(p,'2026-11-07','17:00:00').accepted,'2026-11-09');
assert.equal(schedule(p,'2026-11-22','17:00:00').accepted,'2026-11-24');
assert.equal(schedule(p,'2026-11-06','17:00:00',[event('test','2026-11-09')]).accepted,'2026-11-10');
const publishers=JSON.parse(fs.readFileSync('publishers.json','utf8'));assert.equal(publishers.length,37);assert.equal(new Set(publishers.map(p=>p.id)).size,37);
for(const day of ['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-12-28','2027-01-01'])for(const p of publishers){const s=schedule(p,day,'17:00',[event('self','2026-11-12'),event(p.id,'2026-11-10')]);assert.ok(!closedReason(s.arrival,p.id,[event(p.id,'2026-11-10')]));if(s.home)assert.ok(!closedReason(s.home,'self',[event('self','2026-11-12')]));if(!p.direct)assert.equal(s.direct,null);if(!p.warehouse)assert.equal(s.home,null)}
const html=fs.readFileSync('index.html','utf8'),app=fs.readFileSync('app.mjs','utf8');const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);for(const match of app.matchAll(/\$\('#([\w-]+)'\)/g))assert.ok(ids.includes(match[1])||app.includes('id="'+match[1]+'"'),'missing DOM id '+match[1]);
const {japanNow}=await import('./clock.mjs');assert.deepEqual(japanNow(new Date('2026-11-05T15:00:00Z')),{date:'2026-11-06',time:'00:00:00'});assert.deepEqual(japanNow(new Date('2026-11-05T04:59:59Z')),{date:'2026-11-05',time:'13:59:59'});
assert.equal(schedule(p,'2026-11-05','16:00:00').after,false);assert.equal(schedule(p,'2026-11-05','16:00:01').after,true);
assert.equal(schedule({...p,cutoff:14},'2026-11-05','13:59:59').after,false);assert.equal(schedule({...p,cutoff:14},'2026-11-05','14:00:00').after,true);
for(const cutoff of [14,16])for(const time of ['09:00:00','14:00:00','17:00:00']){const mode=schedule({...p,cutoff},'2026-11-06',time,[],{nextDay:true});assert.equal(mode.accepted,'2026-11-09');assert.equal(mode.direct,'2026-11-10');assert.equal(mode.home,'2026-11-11');assert.equal(mode.forced,true)}
assert.equal(schedule(p,'2026-11-20','09:00:00',[],{nextDay:true}).accepted,'2026-11-24');assert.equal(schedule(p,'2026-11-06','09:00:00',[event('test','2026-11-09')],{nextDay:true}).accepted,'2026-11-10');
assert.equal(schedule(p,'2026-11-06','09:00:00',[],{nextDay:false}).accepted,'2026-11-06');
console.log('PASS: manufacturer vs own closures, delivery stages, cutoff boundaries, weekends, holidays and substitute holidays, busy-period adjustments, year boundaries, 37 publishers and DOM references.');
