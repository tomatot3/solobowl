// Official EDB ZIP, limited to PostgreSQL server files; no system-service installation.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
const root=fileURLToPath(new URL("../",import.meta.url));
const cache=resolve(root,".cache/postgres18-ranges"), target=resolve(root,".cache/postgres18");
for(const p of [cache,target])if(!p.startsWith(resolve(root)+sep))throw Error("Unsafe extraction root");
await mkdir(cache,{recursive:true});
const url="https://get.enterprisedb.com/postgresql/postgresql-18.7-1-windows-x64-binaries.zip", total=389515503;
async function range(start,end){
 const file=resolve(cache,start+"-"+end+".bin");
 try{const bytes=await readFile(file);if(bytes.length===end-start+1)return bytes;}catch{}
 for(let attempt=0;attempt<2;attempt++){
  try{const r=await fetch(url,{headers:{Range:`bytes=${start}-${end}`},signal:AbortSignal.timeout(60000)});
   if(r.status!==206||r.headers.get("content-range")!==`bytes ${start}-${end}/${total}`)throw Error("Unexpected official archive range");
   const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==end-start+1)throw Error("Incomplete range");await writeFile(file,bytes);return bytes;
  }catch(e){if(attempt===1)throw e;}
 }
 throw Error("Download failed");
}
const tail=await range(total-65536,total-1);let e=tail.length-22;
while(e>=0&&tail.readUInt32LE(e)!==0x06054b50)e--;if(e<0)throw Error("ZIP end record missing");
const size=tail.readUInt32LE(e+12), offset=tail.readUInt32LE(e+16);
if(size>8*1024*1024||offset+size>total)throw Error("Invalid ZIP directory");
const directory=await range(offset,offset+size-1), all=[];
for(let p=0;p<directory.length;){
 if(directory.readUInt32LE(p)!==0x02014b50)throw Error("Invalid ZIP directory entry");
 const n=directory.readUInt16LE(p+28),x=directory.readUInt16LE(p+30),c=directory.readUInt16LE(p+32);
 all.push({name:directory.subarray(p+46,p+46+n).toString("utf8"),flags:directory.readUInt16LE(p+8),method:directory.readUInt16LE(p+10),crc:directory.readUInt32LE(p+16),packed:directory.readUInt32LE(p+20),size:directory.readUInt32LE(p+24),offset:directory.readUInt32LE(p+42)});p+=46+n+x+c;
}
all.sort((a,b)=>a.offset-b.offset);
const selected=all.filter(f=>/^pgsql\/bin\/[^/]+\.(exe|dll)$/.test(f.name)||f.name.startsWith("pgsql/share/")&&!f.name.endsWith("/")||/^pgsql\/lib\/[^/]+\.dll$/.test(f.name));
const intervals=[];
for(const f of selected){
 if(f.flags&1||![0,8].includes(f.method)||f.size>128*1024*1024)throw Error("Unsupported archive entry");
 const index=all.indexOf(f),end=(all[index+1]?.offset??offset)-1;
 if(end<f.offset||end>=offset)throw Error("Invalid local-file range");
 const prev=intervals.at(-1);if(prev&&f.offset-prev.end<8192)prev.end=end;else intervals.push({start:f.offset,end});
}
const chunks=[];for(const i of intervals)for(let start=i.start;start<=i.end;start+=2*1024*1024)chunks.push({start,end:Math.min(start+2*1024*1024-1,i.end)});
console.log(JSON.stringify({officialArchive:url,selectedFiles:selected.length,rangeBytes:chunks.reduce((s,c)=>s+c.end-c.start+1,0)}));
let cursor=0,done=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<chunks.length){const item=chunks[cursor++];item.bytes=await range(item.start,item.end);done++;console.log(`Downloaded ${done}/${chunks.length} verified-size ranges`);}}));
function slice(start,length){const out=[];let end=start+length;for(const c of chunks){if(c.end<start||c.start>=end)continue;const lo=Math.max(start,c.start),hi=Math.min(end,c.end+1);out.push(c.bytes.subarray(lo-c.start,hi-c.start));}const b=Buffer.concat(out);if(b.length!==length)throw Error("Missing entry bytes");return b;}
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const manifest=[];
for(const f of selected){
 const header=slice(f.offset,30);if(header.readUInt32LE(0)!==0x04034b50)throw Error("Invalid file header");
 const dataOffset=f.offset+30+header.readUInt16LE(26)+header.readUInt16LE(28);
 const packed=slice(dataOffset,f.packed), data=f.method===0?packed:inflateRawSync(packed,{maxOutputLength:f.size+1});
 if(data.length!==f.size||crc32(data)!==f.crc)throw Error("ZIP integrity failure: "+f.name);
 if(f.name.includes("..")||f.name.includes("\\")||f.name.includes(":"))throw Error("Unsafe entry path");
 const output=resolve(target,f.name);if(!output.startsWith(target+sep))throw Error("Entry escapes target");
 await mkdir(dirname(output),{recursive:true});await writeFile(output,data);
 manifest.push({name:f.name,bytes:data.length,sha256:createHash("sha256").update(data).digest("hex")});
}
await writeFile(resolve(target,"manifest.json"),JSON.stringify({source:url,version:"18.7-1",integrity:"ZIP CRC32 plus local SHA256; publisher checksum not supplied",files:manifest},null,2));
console.log(JSON.stringify({extractedFiles:manifest.length,target,serviceInstalled:false}));
