const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'.runtime'),pipe='\\\\.\\pipe\\solobowl-8797';
fs.mkdirSync(runtime,{recursive:true});
const log=fs.openSync(path.join(runtime,'server.log'),'a');
let child,retry,stopping=false;
function launch(){
 child=spawn(process.execPath,[path.join(__dirname,'serve.cjs')],{cwd:root,windowsHide:true,stdio:['ignore',log,log]});
 child.once('exit',(code,signal)=>{
  fs.appendFileSync(path.join(runtime,'supervisor.log'),`${new Date().toISOString()} server exited ${code??signal}\n`);
  child=null;
  if(stopping){fs.closeSync(log);process.exit(0);}
  retry=setTimeout(launch,5000);
 });
}
const control=net.createServer(socket=>{
 socket.once('data',data=>{
  const command=data.toString().trim();
  if(command==='status'){socket.end(JSON.stringify({pid:process.pid,serverPid:child?.pid||null,root}));return;}
  if(command==='stop'){
   stopping=true;clearTimeout(retry);socket.end('stopping');control.close();
   if(child)child.kill();else{fs.closeSync(log);process.exit(0);}
  }else socket.end('unknown command');
 });
});
control.once('error',error=>{fs.closeSync(log);if(error.code==='EADDRINUSE')process.exit(0);throw error;});
control.listen(pipe,()=>{fs.writeFileSync(path.join(runtime,'supervisor.pid'),String(process.pid));launch();});
