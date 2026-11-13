import {connectSharedStore} from './shared-loader.mjs?v=notes-1';
const $=s=>document.querySelector(s);
export function initializeSharing(config,{onData,onState,toast,localData}){
  let store=null,state={state:'connecting'},pending=0,general=null;
  const canEdit=()=>state.state==='connected'&&!pending;
  function refresh(){
    $('#sharingBar').hidden=false;
    const labels={'connecting':'共有に接続中…','signed-out':'閲覧中','pending':'閲覧中','unverified':'閲覧中','connected':'編集モード・変更は共有保存されます','error':'共有に接続できません'};
    $('#sharingStatus').textContent=labels[state.state]||'共有を準備中';
    $('#sharingLogin').hidden=state.state==='connected';$('#sharingLogin').disabled=!store;
    $('#sharingLogout').hidden=!state.uid;
    const backup=localData?.();
    $('#sharingImport').hidden=state.role!=='owner'||general?.imported!==false||!((backup?.events.length||0)+(backup?.publishers.length||0)||backup?.nextDayMode);
    $('#sharingImport').disabled=!canEdit();
    for(const selector of ['#nextDayMode','#eventForm button[type="submit"]','#leadForm button[type="submit"]'])$(selector).disabled=!canEdit();
    document.querySelectorAll('[data-delete]').forEach(button=>button.disabled=!canEdit());
  }
  async function perform(method,...args){
    if(!canEdit()||!store){toast('編集者としてログインしてください。');return false}
    pending++;refresh();try{await store[method](...args);return true}catch(error){toast(error.message||'共有への保存に失敗しました。');return false}finally{pending--;refresh()}
  }
  function closeLogin(){$('#editorLoginDialog').close();$('#editorLoginForm').reset();$('#editorLoginError').textContent=''}
  $('#sharingLogin').onclick=()=>{$('#editorLoginError').textContent='';$('#editorLoginDialog').showModal();$('#editorLoginId').focus()};
  $('#editorLoginClose').onclick=closeLogin;
  $('#editorLoginDialog').addEventListener('close',()=>{$('#editorLoginForm').reset();$('#editorLoginError').textContent=''});
  $('#editorLoginForm').onsubmit=async event=>{event.preventDefault();$('#editorLoginSubmit').disabled=true;$('#editorLoginError').textContent='';try{await store.login($('#editorLoginId').value.trim(),$('#editorLoginPassword').value);closeLogin();toast('ログインしました。納期を編集できます。')}catch(error){$('#editorLoginError').textContent=['auth/network-request-failed','auth/too-many-requests'].includes(error.code)?(error.code==='auth/too-many-requests'?'試行回数が多いため、少し待ってからお試しください。':'接続できません。通信状態を確認してください。'):'IDまたはパスワードが違います。'}finally{$('#editorLoginPassword').value='';$('#editorLoginSubmit').disabled=false}};
  $('#sharingLogout').onclick=async()=>{try{await store?.logout()}catch(error){toast(error.message)}};
  $('#sharingImport').onclick=async()=>{if(await perform('importLocal',localData()))toast('この端末の設定を共有に取り込みました')};
  connectSharedStore(config,{onData:data=>{general=data.general;onData(data);refresh()},onState:next=>{state=next;refresh();onState?.(next)}}).then(value=>{store=value;refresh()}).catch(error=>{state={state:'error',error:error.message};refresh();toast('共有に接続できません。端末の保存データは保持しています。')});
  refresh();return {configured:true,perform,refresh,canEdit:()=>state.state==='connected',revision:path=>store?.revision(path)||0};
}
