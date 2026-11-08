const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),src=path.join(root,'src'),dist=path.join(root,'dist');
require('../content/build.cjs');
const scripts=['content','resolver','store','timer','illustrations','views','app'];
for(const script of scripts){
 const result=spawnSync(process.execPath,['--check',path.join(src,script+'.js')],{windowsHide:true,encoding:'utf8'});
 if(result.status!==0){console.error(result.stderr);process.exit(1);}
}
fs.mkdirSync(dist,{recursive:true});
for(const file of ['index.html','style.css',...scripts.map(s=>s+'.js')])fs.copyFileSync(path.join(src,file),path.join(dist,file));
fs.mkdirSync(path.join(dist,'legacy-v3'),{recursive:true});
for(const file of ['index.html','style.css','recipes.js','journey.js','app.js'])fs.copyFileSync(path.join(root,'legacy-v3',file),path.join(dist,'legacy-v3',file));
let html=fs.readFileSync(path.join(src,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${fs.readFileSync(path.join(src,'style.css'),'utf8')}</style>`);
html=html.replace(/<script src="([a-z]+)\.js"><\/script>/g,(_,name)=>`<script>${fs.readFileSync(path.join(src,name+'.js'),'utf8').replace(/<\/script/gi,'<\\/script')}</script>`);
fs.writeFileSync(path.join(dist,'solobowl.html'),html);
console.log('Built dist/ and dist/solobowl.html');
