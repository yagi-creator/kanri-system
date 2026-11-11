import {encryptReply} from './auth-channel-crypto.mjs';
const $=id=>document.getElementById(id);let metadata;
try{
 const response=await fetch('./firebase-connect.json',{cache:'no-store'});if(!response.ok)throw Error('設定情報を読み込めませんでした。');metadata=await response.json();
 const url=new URL(metadata.authUrl);if(url.origin!=='https://auth.firebase.tools'||url.pathname!=='/login')throw Error('認証先を確認できませんでした。');
 if(Date.now()>Date.parse(metadata.expiresAt))throw Error('この入力画面は期限切れです。チャットで新しい画面を依頼してください。');
 $('loginLink').href=url.href;$('loginLink').removeAttribute('aria-disabled');$('encryptButton').disabled=false;
 $('expiry').textContent='入力画面の有効期限：'+new Date(metadata.expiresAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）';
}catch(error){$('status').textContent=error.message}
$('codeForm').onsubmit=async event=>{
 event.preventDefault();$('encryptButton').disabled=true;$('status').textContent='端末内で暗号化しています…';
 try{const packet=await encryptReply($('authCode').value,metadata);$('authCode').value='';$('encryptedReply').value=packet;$('result').hidden=false;$('status').textContent='返信データができました。元のコードをチャットに貼る必要はありません。';$('result').scrollIntoView({block:'center',behavior:'smooth'})}
 catch(error){$('status').textContent=error.message}finally{$('encryptButton').disabled=false}
};
$('copyReply').onclick=async()=>{try{await navigator.clipboard.writeText($('encryptedReply').value);$('status').textContent='コピーしました。ChatGPTに戻り、貼り付けてください。'}catch{$('encryptedReply').focus();$('encryptedReply').select();$('status').textContent='返信データを選択しました。長押しでコピーして、ChatGPTに戻ってください。'}};
