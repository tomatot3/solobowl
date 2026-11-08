const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const port=8797,version=require('../package.json').version;
const routes={'/':'index.html','/legacy-v3/':'legacy-v3/index.html'};
for(const name of ['index.html','solobowl.html','style.css','content.js','resolver.js','store.js','timer.js','illustrations.js','views.js','app.js'])routes['/'+name]=name;
for(const name of ['index.html','style.css','recipes.js','journey.js','app.js'])routes['/legacy-v3/'+name]='legacy-v3/'+name;
if(!fs.existsSync(path.join(dist,'index.html')))throw new Error('Run npm run build first.');
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
 const route=new URL(req.url,'http://localhost').pathname;
 if(route==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?'':JSON.stringify({app:'solobowl',version,pid:process.pid,port}));return;}
 const file=routes[route];if(!file){res.writeHead(404);res.end('Not found');return;}
 const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/javascript';
 res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
 if(req.method==='HEAD'){res.end();return;}fs.createReadStream(path.join(dist,file)).pipe(res);
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(new Date().toISOString()+' SoloBowl http://127.0.0.1:'+port));
