import {connectSharedStore} from './shared-loader.mjs';
const $=s=>document.querySelector(s);
export function initializeSharing(config,{onData,onState,toast,localData}){
  let store=null,state={state:'connecting'},pending=0,general=null;
  const canEdit=()=>state.state==='connected'&&!pending;
  function refresh(){
    $('#sharingBar').hidden=false;
    const labels={'connecting':'共有に接続中…','signed-out':'共有保存にはログインが必要です','pending':'このアカウントには編集権限がありません','unverified':'メール認証が必要です','connected':'共有保存中','error':'共有に接続できません'};
    $('#sharingStatus').textContent=labels[state.state]||'共有を準備中';
    $('#sharingLogin').hidden=!!state.uid;$('#sharingLogin').disabled=!store;
    $('#sharingLogout').hidden=!state.uid;
    const backup=localData?.();
    $('#sharingImport').hidden=state.role!=='owner'||general?.imported!==false||!((backup?.events.length||0)+(backup?.publishers.length||0)||backup?.nextDayMode);
    $('#sharingImport').disabled=!canEdit();
    for(const selector of ['#nextDayMode','#eventForm button[type="submit"]','#leadForm button[type="submit"]'])$(selector).disabled=!canEdit();
    document.querySelectorAll('[data-delete]').forEach(button=>button.disabled=!canEdit());
  }
  async function perform(method,...args){
    if(!canEdit()||!store){toast('Googleでログインして、共有への接続を確認してください。');return false}
    pending++;refresh();try{await store[method](...args);return true}catch(error){toast(error.message||'共有への保存に失敗しました。');return false}finally{pending--;refresh()}
  }
  $('#sharingLogin').onclick=async()=>{try{if(!store)return;await store.login()}catch(error){toast(error.code==='auth/popup-blocked'?'SafariまたはChromeでアプリを開いてログインしてください。':error.message)}};
  $('#sharingLogout').onclick=async()=>{try{await store?.logout()}catch(error){toast(error.message)}};
  $('#sharingImport').onclick=async()=>{if(await perform('importLocal',localData()))toast('この端末の設定を共有に取り込みました')};
  connectSharedStore(config,{onData:data=>{general=data.general;onData(data);refresh()},onState:next=>{state=next;refresh();onState?.(next)}}).then(value=>{store=value;refresh()}).catch(error=>{state={state:'error',error:error.message};refresh();toast('共有に接続できません。端末の保存データは保持しています。')});
  refresh();return {configured:true,perform,refresh,revision:path=>store?.revision(path)||0};
}
