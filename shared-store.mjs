export class SharedConflictError extends Error {
  constructor(){super('別の人が更新しました。最新の内容を確認して、もう一度保存してください。');this.name='SharedConflictError'}
}
const dateValue=t=>t.toDate().toISOString().slice(0,10);
export class SharedStore {
  constructor({db,auth,sdk,onState=()=>{},onData=()=>{}}){
    Object.assign(this,{db,auth,sdk,onState,onData});this.role=null;this.user=null;this.ready=false;this.unsub=[];this.revisions=new Map();this.session=0;
  }
  start(){this.authUnsub=this.sdk.onAuthStateChanged(this.auth,user=>this.authChanged(user));return this}
  stop(){this.session++;this.clear();this.authUnsub?.()}
  clearData(){this.unsub.forEach(fn=>fn());this.unsub=[];this.ready=false;this.revisions.clear();this.listeningSession=null}
  clear(){this.accessUnsub?.();this.accessUnsub=null;this.clearData();this.role=null}
  status(state,error){this.onState({state,role:this.role,uid:this.user?.uid||'',name:this.user?.displayName||'',error})}
  async login(){return this.sdk.signInWithPopup(this.auth,new this.sdk.GoogleAuthProvider())}
  async logout(){return this.sdk.signOut(this.auth)}
  metadata(previous){const stamp=this.sdk.serverTimestamp();return {createdAt:previous?.createdAt||stamp,createdBy:previous?.createdBy||this.user.uid,updatedAt:stamp,updatedBy:this.user.uid,revision:(previous?.revision||0)+1}}
  async authChanged(user){
    const session=++this.session;this.clear();this.user=user;
    if(!user){this.status('signed-out');return}
    if(!user.emailVerified){this.status('unverified');return}
    this.status('connecting');let attempted=false;
    const ref=this.sdk.doc(this.db,'access',user.uid);
    const unsubscribe=this.sdk.onSnapshot(ref,{includeMetadataChanges:true},async snap=>{
      if(session!==this.session||snap.metadata.hasPendingWrites||snap.metadata.fromCache)return;
      if(!snap.exists()){
        if(this.role){this.clearData();this.role=null;this.status('pending');return}
        if(attempted){this.status('pending');return}attempted=true;
        try{await this.sdk.runTransaction(this.db,async tx=>{const current=await tx.get(ref);if(!current.exists())tx.set(ref,{uid:user.uid,role:'owner',...this.metadata(null)})})}
        catch(error){if(session!==this.session)return;if(error.code==='permission-denied')this.status('pending');else this.status('error',error.message)}
        return;
      }
      const role=snap.data().role;if(!['owner','editor'].includes(role)){this.status('pending');return}
      if(this.role===role&&this.ready)return;this.role=role;
      try{
        if(role==='owner')await this.write('settings/general',{nextDayMode:false,imported:false},0,true);
        if(session!==this.session)return;this.watchData(session);
      }catch(error){if(session===this.session)this.status('error',error.message)}
    },error=>{if(session===this.session){this.clear();this.status('error',error.message)}});
    this.accessUnsub=unsubscribe;
  }
  watchData(session){
    if(this.listeningSession===session)return;this.listeningSession=session;
    const seen=new Set(),data={events:[],publishers:[],general:null};
    const deliver=()=>{if(session!==this.session||seen.size!==3||!data.general)return;this.ready=true;this.status('connected');this.onData({...data,events:[...data.events],publishers:[...data.publishers]})};
    const failure=error=>{if(session!==this.session)return;this.clearData();this.status(error.code==='permission-denied'?'pending':'error',error.message)};
    const watch=(ref,key,convert)=>this.unsub.push(this.sdk.onSnapshot(ref,{includeMetadataChanges:true},snap=>{
      if(session!==this.session||snap.metadata.hasPendingWrites||snap.metadata.fromCache)return;
      data[key]=convert(snap);seen.add(key);deliver();
    },failure));
    watch(this.sdk.doc(this.db,'settings','general'),'general',snap=>{
      if(!snap.exists())return null;this.revisions.set('settings/general',snap.data().revision);return snap.data();
    });
    watch(this.sdk.collection(this.db,'publishers'),'publishers',snap=>{for(const key of this.revisions.keys())if(key.startsWith('publishers/'))this.revisions.delete(key);return snap.docs.map(doc=>{this.revisions.set('publishers/'+doc.id,doc.data().revision);return {id:doc.id,...doc.data()}})});
    watch(this.sdk.collection(this.db,'adjustments'),'events',snap=>{for(const key of this.revisions.keys())if(key.startsWith('adjustments/'))this.revisions.delete(key);return snap.docs.map(doc=>{const value=doc.data();this.revisions.set('adjustments/'+doc.id,value.revision);return {id:doc.id,target:value.target,kind:value.kind,start:dateValue(value.startAt),end:dateValue(value.endAt),reason:value.reason,extra:value.extra}})});
  }
  requireEditor(){if(!this.ready||!this.user||!this.role)throw Error('Googleでログインして、共有への接続を確認してください。')}
  revision(path){return this.revisions.get(path)||0}
  async write(path,values,expected,createOnly=false){
    if(!this.user)throw Error('ログインが必要です。');const ref=this.sdk.doc(this.db,...path.split('/'));
    return this.sdk.runTransaction(this.db,async tx=>{
      const snap=await tx.get(ref),previous=snap.exists()?snap.data():null;
      if(createOnly&&previous)return;
      if((previous?.revision||0)!==expected)throw new SharedConflictError();
      tx.set(ref,{...previous,...values,...this.metadata(previous)});
    });
  }
  async setMode(nextDayMode){this.requireEditor();return this.write('settings/general',{nextDayMode},this.revision('settings/general'))}
  async setPublisher(id,lead,cutoff,revision=this.revision('publishers/'+id)){this.requireEditor();return this.write('publishers/'+id,{lead,cutoff},revision)}
  async addEvent(event){
    this.requireEditor();const value={id:event.id,target:event.target,kind:event.kind,reason:event.reason,extra:event.kind==='closed'?0:event.extra,startAt:this.sdk.Timestamp.fromDate(new Date(event.start+'T00:00:00Z')),endAt:this.sdk.Timestamp.fromDate(new Date(event.end+'T00:00:00Z'))};
    return this.write('adjustments/'+event.id,value,0);
  }
  async deleteEvent(id){
    this.requireEditor();const path='adjustments/'+id,expected=this.revision(path),ref=this.sdk.doc(this.db,'adjustments',id);
    return this.sdk.runTransaction(this.db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())return;if(snap.data().revision!==expected)throw new SharedConflictError();tx.delete(ref)});
  }
  async importLocal({publishers=[],events=[],nextDayMode=false}){
    this.requireEditor();if(this.role!=='owner')throw Error('管理者のみ操作できます。');
    if(publishers.length+events.length>230)throw Error('取り込む件数が多いため、内容の確認が必要です。');
    const entries=[...publishers.map(p=>({path:'publishers/'+p.id,value:{lead:p.lead,cutoff:p.cutoff}})),...events.map(e=>({path:'adjustments/'+e.id,value:{id:e.id,target:e.target,kind:e.kind,reason:e.reason,extra:e.kind==='closed'?0:e.extra,startAt:this.sdk.Timestamp.fromDate(new Date(e.start+'T00:00:00Z')),endAt:this.sdk.Timestamp.fromDate(new Date(e.end+'T00:00:00Z'))}}))];
    if(new Set(entries.map(e=>e.path)).size!==entries.length)throw Error('端末の保存設定に重複があります。');
    const generalRef=this.sdk.doc(this.db,'settings','general'),expected=this.revision('settings/general');
    return this.sdk.runTransaction(this.db,async tx=>{
      const general=await tx.get(generalRef);if(!general.exists())throw Error('共有の初期設定が終わっていません。');
      if(general.data().revision!==expected)throw new SharedConflictError();
      if(general.data().imported)throw Error('端末からの初回取り込みは完了しています。');
      const snapshots=await Promise.all(entries.map(entry=>tx.get(this.sdk.doc(this.db,...entry.path.split('/')))));
      if(snapshots.some(snap=>snap.exists()))throw Error('共有側に同じ設定があるため、上書きせず取り込みを中止しました。');
      entries.forEach(entry=>tx.set(this.sdk.doc(this.db,...entry.path.split('/')),{...entry.value,...this.metadata(null)}));
      tx.set(generalRef,{...general.data(),nextDayMode,imported:true,...this.metadata(general.data())});
    });
  }
  async members(){this.requireEditor();if(this.role!=='owner')throw Error('管理者のみ操作できます。');return (await this.sdk.getDocs(this.sdk.collection(this.db,'access'))).docs.map(doc=>doc.data())}
  async grant(uid){
    this.requireEditor();if(this.role!=='owner')throw Error('管理者のみ操作できます。');if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||uid===this.user.uid)throw Error('共有IDを確認してください。');
    return this.write('access/'+uid,{uid,role:'editor'},0,true);
  }
  async revoke(uid){this.requireEditor();if(this.role!=='owner'||uid===this.user.uid)throw Error('この共有IDは解除できません。');return this.sdk.deleteDoc(this.sdk.doc(this.db,'access',uid))}
}
