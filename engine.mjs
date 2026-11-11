export const key=d=>d.toISOString().slice(0,10);
export const date=s=>new Date(s+'T00:00:00Z');
export const plus=(s,n)=>{const d=date(s);d.setUTCDate(d.getUTCDate()+n);return key(d)};
export const diff=(a,b)=>Math.round((date(a)-date(b))/86400000);
const cache=new Map();
export function holidays(year){if(cache.has(year))return cache.get(year);const map=new Map();const put=(m,d,name)=>map.set(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,name);const nth=(m,n)=>{const dow=new Date(Date.UTC(year,m-1,1)).getUTCDay();return 1+(8-dow)%7+(n-1)*7};
put(1,1,'元日');put(1,nth(1,2),'成人の日');put(2,11,'建国記念の日');put(2,23,'天皇誕生日');put(3,Math.floor(20.8431+.242194*(year-1980))-Math.floor((year-1980)/4),'春分の日');put(4,29,'昭和の日');put(5,3,'憲法記念日');put(5,4,'みどりの日');put(5,5,'こどもの日');put(7,nth(7,3),'海の日');put(8,11,'山の日');put(9,nth(9,3),'敬老の日');put(9,Math.floor(23.2488+.242194*(year-1980))-Math.floor((year-1980)/4),'秋分の日');put(10,nth(10,2),'スポーツの日');put(11,3,'文化の日');put(11,23,'勤労感謝の日');
for(const s of [...map.keys()]){const next=plus(s,1),after=plus(s,2);if(map.has(after)&&!map.has(next)&&date(next).getUTCDay()!==0)map.set(next,'国民の休日')}
for(const s of [...map.keys()].sort()){if(date(s).getUTCDay()===0){let next=plus(s,1);while(map.has(next))next=plus(next,1);map.set(next,'振替休日')}}cache.set(year,map);return map}
export function closedReason(s,target,events=[]){const dow=date(s).getUTCDay();if(dow===0||dow===6)return '土日';const holiday=holidays(+s.slice(0,4)).get(s);if(holiday)return holiday;const e=events.find(e=>e.target===target&&e.kind==='closed'&&s>=e.start&&s<=e.end);return e?e.reason||'休業':null}
export function nextOpen(s,target,events=[]){let d=s;for(let i=0;i<3660;i++){if(!closedReason(d,target,events))return d;d=plus(d,1)}throw Error('休業期間が長すぎます')}
export function addBusiness(s,n,target,events=[]){let d=s;const trace=[];for(let i=0,count=0;count<n;i++){if(i>3660)throw Error('計算範囲を超えました');d=plus(d,1);const reason=closedReason(d,target,events);trace.push({date:d,reason,target});if(!reason)count++}return {date:d,trace}}
export function afterCutoff(time,cutoff){const [h,m,s=0]=time.split(':').map(Number);return h*3600+m*60+s>Number(cutoff)*3600}
export function schedule(p,order,time,events=[]){let accepted=nextOpen(order,p.id,events);const after=afterCutoff(time,p.cutoff);if(after)accepted=addBusiness(accepted,1,p.id,events).date;const extra=events.filter(e=>e.target===p.id&&e.kind==='delay'&&order>=e.start&&order<=e.end).reduce((n,e)=>n+Number(e.extra||0),0);const lead=addBusiness(accepted,Number(p.lead)+extra,p.id,events);const outbound=addBusiness(lead.date,1,'self',events);return {accepted,after,extra,arrival:lead.date,direct:p.direct?lead.date:null,home:p.warehouse?outbound.date:null,trace:lead.trace,homeTrace:outbound.trace}}
export function monday(s){return plus(s,-((date(s).getUTCDay()+6)%7))}
