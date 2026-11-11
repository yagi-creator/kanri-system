import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),stateFile=path.join(root,'firebase/setup-state.json');
const databaseId='shipping-shared',location='asia-northeast2';
const plan=['Verify authenticated Firebase account','Create/reuse this setup session\'s dedicated Firebase project','Create Enterprise Native Firestore in Osaka with realtime updates','Deploy restrictive rules and Google sign-in settings','Seed the server-only owner identity','Register the Web app and generate the public SDK configuration'];
if(process.argv.includes('--plan')){console.log(JSON.stringify({databaseId,location,edition:'ENTERPRISE',steps:plan},null,2));process.exit(0)}
function cli(args){const r=spawnSync('npx',['-y','firebase-tools@latest',...args,'--non-interactive','--json'],{cwd:root,env:process.env,encoding:'utf8'});let result;try{result=JSON.parse(r.stdout)}catch{throw Error('Firebase CLI returned a non-JSON response. Check the local Firebase CLI log.')}if(r.status!==0||result.status!=='success')throw Error(result.error||'Firebase operation failed.');return result.result}
async function setup(){
const accounts=cli(['login:list']);if(!Array.isArray(accounts)||!accounts.length)throw Error('Firebase CLIへのログインが未完了です。本番リソースは変更していません。');
const ownerEmail=accounts[0]?.user?.email;if(!ownerEmail)throw Error('認証済みアカウントを確認できません。');
let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{projectId:'noki-shared-'+randomBytes(5).toString('hex')};
const persist=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2),{mode:0o600});persist();
const projects=cli(['projects:list'])||[];if(!state.projectCreated&&!projects.some(project=>project.projectId===state.projectId))cli(['projects:create',state.projectId,'--display-name','Shipping Guide']);
state.projectCreated=true;persist();
const require=createRequire(import.meta.url),{requireAuth}=require('firebase-tools/lib/requireAuth');
const account=require('firebase-tools/lib/auth').getGlobalDefaultAccount();
await requireAuth({project:state.projectId,nonInteractive:true,...account});
await require('firebase-tools/lib/ensureApiEnabled').ensure(state.projectId,'firestore.googleapis.com','firestore');
const databases=cli(['firestore:databases:list','--project',state.projectId])||[];
const database=databases.find(db=>db.name?.endsWith('/'+databaseId));
if(!database)cli(['firestore:databases:create',databaseId,'--project',state.projectId,'--edition','enterprise','--location',location,'--firestore-data-access','ENABLED','--mongodb-compatible-data-access','DISABLED','--realtime-updates','ENABLED']);
const details=cli(['firestore:databases:get',databaseId,'--project',state.projectId]);
if(details.databaseEdition!=='ENTERPRISE'||details.locationId!==location)throw Error('作成先のエディションまたは保存場所が予定と異なります。');
const runtimeConfig=JSON.parse(fs.readFileSync(path.join(root,'firebase/firebase.json'),'utf8'));
runtimeConfig.auth={providers:{googleSignIn:{oAuthBrandDisplayName:'納期共有',supportEmail:ownerEmail,authorizedRedirectUris:[`https://${state.projectId}.firebaseapp.com/__/auth/handler`,'https://yagi-creator.github.io']}}};
// This runtime file contains the owner's email and is never committed or deployed as a public asset.
const runtimeFile=path.join(root,'firebase/auth.runtime.json');fs.writeFileSync(runtimeFile,JSON.stringify(runtimeConfig,null,2),{mode:0o600});
cli(['deploy','--project',state.projectId,'--config','firebase/auth.runtime.json','--only','firestore,auth']);
// Firestore document writes are unavailable in the connector. Reuse Firebase CLI's
// own authenticated HTTP client rather than exporting or inspecting credentials.
const {Client}=require('firebase-tools/lib/apiv2');const api=new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1',auth:true});
const bootstrapPath=`projects/${state.projectId}/databases/${databaseId}/documents/private/bootstrap`;
let bootstrap;try{bootstrap=(await api.get(bootstrapPath)).body}catch(error){if(error.status!==404&&error.context?.response?.statusCode!==404)throw error}
if(bootstrap&&bootstrap.fields?.ownerEmail?.stringValue!==ownerEmail)throw Error('初期管理者が異なるため、上書きを中止しました。');
if(!bootstrap)await api.patch(bootstrapPath,{fields:{ownerEmail:{stringValue:ownerEmail}}},{queryParams:{'currentDocument.exists':false}});
if(!state.webAppId){const listed=cli(['apps:list','WEB','--project',state.projectId]);const apps=Array.isArray(listed)?listed:(listed?.apps||[]);const existing=apps.find(app=>app.displayName==='納期共有 Web');state.webAppId=existing?.appId||cli(['apps:create','WEB','納期共有 Web','--project',state.projectId]).appId;persist()}
const configResult=cli(['apps:sdkconfig','WEB',state.webAppId,'--project',state.projectId]);
const firebaseConfig=configResult.sdkConfig||configResult;
if(firebaseConfig.projectId!==state.projectId||!firebaseConfig.apiKey)throw Error('Webアプリの設定を検証できませんでした。');
fs.writeFileSync(path.join(root,'firebase-config.mjs'),'export default '+JSON.stringify({firebaseConfig,databaseId},null,2)+';\n');
state.ready=true;persist();console.log(JSON.stringify({status:'ready',projectId:state.projectId,databaseId,location},null,2));

}
setup().catch(error=>{console.error(error.message||'Firebase setup failed.');process.exitCode=1});
