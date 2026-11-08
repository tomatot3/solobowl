const path=require('node:path'),{spawnSync}=require('node:child_process');
const commands={build:['build.cjs'],start:['manage.cjs','start'],stop:['manage.cjs','stop'],restart:['manage.cjs','restart'],status:['manage.cjs','status'],server:['serve.cjs'],'autostart-install':['autostart.cjs','install'],'autostart-remove':['autostart.cjs','remove']};
const command=commands[process.argv[2]||'status'];
if(!command){console.error('Use build, start, stop, restart, status, server, autostart-install or autostart-remove.');process.exit(1);}
const result=spawnSync(process.execPath,[path.join(__dirname,command[0]),...command.slice(1)],{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:'inherit'});
process.exitCode=result.status??1;
