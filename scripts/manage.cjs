const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'.runtime'),pipe='\\\\.\\pipe\\solobowl-8797';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function request(command){return new Promise((resolve,reject)=>{const client=net.connect(pipe,()=>client.write(command+'\n'));let output='';client.setTimeout(3000,()=>client.destroy(new Error('Supervisor did not respond')));client.on('data',x=>output+=x);client.on('end',()=>resolve(output));client.on('error',reject);});}
function health(){return new Promise((resolve,reject)=>{const req=http.get('http://127.0.0.1:8797/healthz',res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>{try{const result=JSON.parse(text);if(result.app!=='solobowl')throw new Error('Port 8797 belongs to another service');resolve(result);}catch(e){reject(e);}});});req.setTimeout(2000,()=>req.destroy(new Error('Health request timed out')));req.on('error',reject);});}
async function status(){let supervisor=null,website=null;try{supervisor=JSON.parse(await request('status'));}catch{}try{website=await health();}catch{}return {supervisor,website,url:'http://127.0.0.1:8797'};}
async function start(){
 const before=await status();if(before.supervisor){console.log(JSON.stringify(before));return;}
 if(!fs.existsSync(path.join(root,'dist/index.html')))throw new Error('Run npm run build first.');
 fs.mkdirSync(runtime,{recursive:true});const log=fs.openSync(path.join(runtime,'supervisor.log'),'a');
 const proc=spawn(process.execPath,[path.join(__dirname,'supervisor.cjs')],{cwd:root,windowsHide:true,detached:true,stdio:['ignore',log,log]});proc.unref();fs.closeSync(log);
 for(let i=0;i<24;i++){await pause(250);const s=await status();if(s.website&&s.supervisor&&s.website.pid===s.supervisor.serverPid){console.log(JSON.stringify(s));return;}}
 throw new Error('Website did not start. See .runtime/server.log');
}
async function stop(){
 const before=await status();if(!before.supervisor){console.log('Supervisor is not running.');return;}
 await request('stop');for(let i=0;i<20;i++){await pause(150);const s=await status();if(!s.supervisor){console.log('Stopped');return;}}
 throw new Error('Supervisor has not stopped yet.');
}
(async()=>{const cmd=process.argv[2]||'status';if(cmd==='start')await start();else if(cmd==='stop')await stop();else if(cmd==='restart'){await stop();await start();}else if(cmd==='status')console.log(JSON.stringify(await status(),null,2));else throw new Error('Use start, stop, restart or status.');})().catch(error=>{console.error(error.message);process.exitCode=1;});
