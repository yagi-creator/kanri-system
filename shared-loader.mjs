import {SharedStore} from './shared-store.mjs?v=notes-1';
export async function connectSharedStore(settings,callbacks={}){
  if(!settings?.firebaseConfig?.projectId||!settings?.databaseId)throw Error('共有データベースはまだ接続されていません。');
  const [app,auth,firestore]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js')
  ]);
  const firebaseApp=app.initializeApp(settings.firebaseConfig,'shipping-shared');
  const db=firestore.initializeFirestore(firebaseApp,{localCache:firestore.memoryLocalCache()},settings.databaseId);
  return new SharedStore({db,auth:auth.getAuth(firebaseApp),sdk:{...auth,...firestore},loginAccount:settings.editorLogin,...callbacks}).start();
}
