const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'.runtime');
const startup=path.join(process.env.APPDATA,'Microsoft/Windows/Start Menu/Programs/Startup');
const shortcut=path.join(startup,'SoloBowl.lnk'),launcher=path.join(runtime,'start-hidden.vbs');
const cmd=process.argv[2];
if(cmd==='remove'){fs.rmSync(shortcut,{force:true});console.log('Removed SoloBowl sign-in startup.');}
else if(cmd==='install'){
 fs.mkdirSync(runtime,{recursive:true});
 const quote=x=>'"'+x.replaceAll('"','""')+'"';
 const command='"'+process.execPath+'" "'+path.join(__dirname,'manage.cjs')+'" start';
 fs.writeFileSync(launcher,'Set sh = CreateObject("WScript.Shell")\r\nsh.Run '+quote(command)+', 0, False\r\n');
 const helper=path.join(runtime,'install-shortcut.vbs');
 fs.writeFileSync(helper,'Set sh = CreateObject("WScript.Shell")\r\nSet link = sh.CreateShortcut('+quote(shortcut)+')\r\nlink.TargetPath = '+quote(path.join(process.env.WINDIR,'System32/wscript.exe'))+'\r\nlink.Arguments = '+quote('"'+launcher+'"')+'\r\nlink.WorkingDirectory = '+quote(root)+'\r\nlink.WindowStyle = 7\r\nlink.Save\r\n');
 const result=spawnSync(path.join(process.env.WINDIR,'System32/cscript.exe'),['//Nologo',helper],{windowsHide:true,encoding:'utf8'});
 fs.rmSync(helper);if(result.status!==0){console.error(result.stderr);process.exit(1);}console.log('Installed SoloBowl startup after Windows sign-in: '+shortcut);
}else{console.error('Use install or remove.');process.exitCode=1;}
