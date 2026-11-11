import {connectSharedStore} from './shared-loader.mjs';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initializeSharing(config,{onData,onState,toast,localData}){
  let store=null,state={state:'connecting'},pending=0,general=null;
  const canEdit=()=>state.state==='connected'&&!pending;
  function refresh(){
    $('#sharingBar').hidden=false;
    const labels={'connecting':'共有に接続中…','signed-out':'共有へのログインが必要です','pending':'管理者の登録を待っています','unverified':'メール認証が必要です','connected':'共有中・変更は全員に反映されます','error':'共有に接続できません'};
    $('#sharingStatus').textContent=labels[state.state]||'共有を準備中';
    $('#shareButton').textContent=state.state==='signed-out'?'Googleでログイン':'共同編集';
    $('#sharingStatusNote').textContent=state.state==='pending'?'管理者に下の共有IDを渡して、編集者として登録してもらってください。':labels[state.state]||'';
    $('#sharingName').textContent=state.name||'';$('#sharingUid').textContent=state.uid||'';
    $('#sharingIdentity').hidden=!state.uid;$('#sharingLogin').hidden=!!state.uid;$('#sharingLogout').hidden=!state.uid;
    $('#sharingImport').disabled=!canEdit()||general?.imported!==false;
    const backup=localData?.();$('#sharingImportNote').textContent=general?.imported?'初回取り込みは完了しています。':`この端末の調整 ${backup?.events.length||0}件・基本日数の変更 ${backup?.publishers.length||0}社を共有に取り込めます。共有側に同じ設定がある場合は、上書きせず中止します。`;
    $('#sharingOwner').hidden=state.role!=='owner'||state.state!=='connected';
    for(const selector of ['#nextDayMode','#eventForm button[type="submit"]','#leadForm button[type="submit"]'])$(selector).disabled=!canEdit();
    document.querySelectorAll('[data-delete]').forEach(button=>button.disabled=!canEdit());
  }
  async function members(){
    if(state.role!=='owner'||!store)return;
    const data=await store.members();$('#sharingMembers').innerHTML=data.map(member=>`<div class="sharing-member"><code>${esc(member.uid)}</code><span>${member.role==='owner'?'管理者':'編集者'}</span>${member.uid!==state.uid?`<button type="button" data-revoke="${esc(member.uid)}">解除</button>`:''}</div>`).join('');
  }
  async function perform(method,...args){
    if(!canEdit()||!store){toast('Googleでログインして、共有への接続を確認してください。');return false}
    pending++;refresh();try{await store[method](...args);return true}catch(error){toast(error.message||'共有への保存に失敗しました。');return false}finally{pending--;refresh()}
  }
  async function open(){if(state.state==='signed-out'){await login();return}$('#sharingDialog').showModal();try{await members()}catch(error){toast(error.message)}}
  async function login(){try{if(!store)throw Error('接続準備が終わるまで少しお待ちください。');await store.login()}catch(error){toast(error.code==='auth/popup-blocked'?'SafariまたはChromeでアプリを開いてログインしてください。':error.message)}}
  $('#shareButton').onclick=open;$('#sharingLogin').onclick=login;
  $('#sharingClose').onclick=()=>$('#sharingDialog').close();
  $('#sharingLogout').onclick=async()=>{try{await store?.logout();$('#sharingDialog').close()}catch(error){toast(error.message)}};
  $('#sharingCopyUid').onclick=async()=>{try{await navigator.clipboard.writeText(state.uid);toast('共有IDをコピーしました')}catch{toast('表示された共有IDを選択してコピーしてください。')}};
  $('#sharingMemberForm').onsubmit=async event=>{event.preventDefault();if(await perform('grant',$('#sharingMemberUid').value.trim())){$('#sharingMemberUid').value='';await members();toast('編集者を登録しました')}};
  $('#sharingImport').onclick=async()=>{if(await perform('importLocal',localData()))toast('この端末の設定を共有に取り込みました')};
  $('#sharingMembers').onclick=async event=>{const button=event.target.closest('[data-revoke]');if(button&&await perform('revoke',button.dataset.revoke)){await members();toast('編集権限を解除しました')}};
  connectSharedStore(config,{onData:data=>{general=data.general;onData(data);refresh()},onState:next=>{state=next;refresh();onState?.(next)}}).then(value=>{store=value}).catch(error=>{state={state:'error',error:error.message};refresh();toast('共有に接続できません。端末の保存データは保持しています。')});
  refresh();return {configured:true,perform,refresh,revision:path=>store?.revision(path)||0};
}
