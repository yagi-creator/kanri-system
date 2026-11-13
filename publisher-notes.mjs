const $=id=>document.getElementById(id);
export function initializePublisherNotes({getPublisher,getNote,getRevision,canEdit,saveNote,toast}){
  let publisherId=null,editing=false,draftRevision=0,pending=false;
  const dialog=$('publisherNotesDialog'),input=$('publisherNotesInput');
  function refresh(){
    if(!publisherId)return;
    const publisher=getPublisher(publisherId);if(!publisher)return;
    const note=getNote(publisherId)||'',allowed=canEdit();
    if(!allowed)editing=false;
    $('publisherNotesTitle').textContent=publisher.name+'の注意事項';
    $('publisherNotesText').textContent=note||'注意事項は登録されていません';
    $('publisherNotesView').hidden=editing;
    $('publisherNotesForm').hidden=!editing;
    $('publisherNotesEdit').hidden=!allowed;
    $('publisherNotesEdit').textContent=note?'編集する':'注意事項を登録';
    $('publisherNotesDelete').hidden=!allowed||!note;
    $('publisherNotesAccess').hidden=allowed;
    for(const id of ['publisherNotesEdit','publisherNotesDelete','publisherNotesSave'])$(id).disabled=pending;
    input.disabled=pending;
  }
  function close(){if(pending)return;dialog.close();editing=false;input.value='';$('publisherNotesError').textContent=''}
  $('publisherNotesClose').onclick=close;
  dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault()});
  dialog.addEventListener('close',()=>{editing=false;input.value='';publisherId=null});
  $('publisherNotesEdit').onclick=()=>{if(!canEdit())return;editing=true;draftRevision=getRevision(publisherId);input.value=getNote(publisherId)||'';$('publisherNotesError').textContent='';refresh();input.focus()};
  $('publisherNotesCancel').onclick=()=>{if(pending)return;editing=false;input.value='';$('publisherNotesError').textContent='';refresh()};
  async function persist(text,revision){
    if(pending||!canEdit())return;
    if(text.length>10000){$('publisherNotesError').textContent='注意事項は10,000文字以内で入力してください。';return}
    pending=true;refresh();
    try{
      const saved=await saveNote(publisherId,text,revision);
      if(saved){editing=false;input.value='';$('publisherNotesError').textContent='';toast(text?'注意事項を保存しました':'注意事項を削除しました')}
      else $('publisherNotesError').textContent='保存できませんでした。入力内容は保持しています。キャンセルして最新の内容を確認するか、通信状態を確認してください。';
    }catch{ $('publisherNotesError').textContent='保存できませんでした。入力内容は保持しています。'}
    finally{pending=false;refresh()}
  }
  $('publisherNotesForm').onsubmit=event=>{event.preventDefault();return persist(input.value,draftRevision)};
  $('publisherNotesDelete').onclick=()=>persist('',getRevision(publisherId));
  refresh();return {open(id){if(!getPublisher(id))return;publisherId=id;editing=false;input.value='';$('publisherNotesError').textContent='';refresh();if(!dialog.open)dialog.showModal()},refresh};
}
