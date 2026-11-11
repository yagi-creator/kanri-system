// The visible clock and all cutoff calculations use the same JST snapshot.
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function japanNow(now=new Date()){
  const parts=Object.fromEntries(formatter.formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}:${parts.second}`};
}
