const bytes=new TextEncoder();
export const encode=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));
export async function encryptReply(code,metadata){
 if(typeof code!=='string'||!code.trim()||code.length>4096)throw Error('Firebaseの認証コードを入力してください。');
 if(Date.now()>Date.parse(metadata.expiresAt))throw Error('この入力画面は期限切れです。チャットで新しい画面を依頼してください。');
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const rsa=await crypto.subtle.importKey('jwk',metadata.publicKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['wrapKey']);
 const wrappedKey=await crypto.subtle.wrapKey('raw',key,rsa,{name:'RSA-OAEP'}),iv=crypto.getRandomValues(new Uint8Array(12));
 const aad=bytes.encode(metadata.sessionId+'|'+metadata.expiresAt);
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,bytes.encode(code.trim()));
 return 'FBAUTH1.'+encode(bytes.encode(JSON.stringify({v:1,sessionId:metadata.sessionId,expiresAt:metadata.expiresAt,wrappedKey:encode(wrappedKey),iv:encode(iv),ciphertext:encode(ciphertext)})));
}
export async function decryptReply(packet,privatePkcs8,metadata){
 if(typeof packet!=='string'||!packet.startsWith('FBAUTH1.')||packet.length>30000)throw Error('Invalid encrypted reply');
 const data=JSON.parse(new TextDecoder().decode(decode(packet.slice(8))));
 if(data.v!==1||data.sessionId!==metadata.sessionId||data.expiresAt!==metadata.expiresAt||Date.now()>Date.parse(data.expiresAt))throw Error('Wrong or expired authentication session');
 const rsa=await crypto.subtle.importKey('pkcs8',privatePkcs8,{name:'RSA-OAEP',hash:'SHA-256'},false,['unwrapKey']);
 const key=await crypto.subtle.unwrapKey('raw',decode(data.wrappedKey),rsa,{name:'RSA-OAEP'},{name:'AES-GCM',length:256},false,['decrypt']);
 const iv=decode(data.iv);if(iv.length!==12)throw Error('Invalid nonce');
 const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:bytes.encode(data.sessionId+'|'+data.expiresAt)},key,decode(data.ciphertext));
 const code=new TextDecoder().decode(plaintext);if(!code||code.length>4096)throw Error('Invalid code length');return code;
}
