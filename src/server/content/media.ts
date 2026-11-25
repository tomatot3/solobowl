import {createHash} from "node:crypto";
import {readFile,realpath,stat} from "node:fs/promises";
import {resolve} from "node:path";
import type {Binding} from "../../domain/content/normalize";

export async function validateCover(image:string|null,bindings:readonly Binding[]){
  if(image===null)return;
  const match=/^\/content\/([a-f0-9]{64})\.(jpg|png|webp)$/.exec(image);
  if(!match||!bindings.some(binding=>binding.sha256===match[1]))throw new Error("COVER_SOURCE_UNVERIFIED");
  const root=await realpath(resolve("public/content")).catch(()=>null);
  const file=root&&resolve(root,match[1]+"."+match[2]);
  if(!file||await realpath(file).catch(()=>null)!==file)throw new Error("COVER_UNAVAILABLE");
  const info=await stat(file);
  if(!info.isFile()||info.size>16*1024*1024)throw new Error("COVER_UNAVAILABLE");
  const bytes=await readFile(file);
  const format=bytes.subarray(0,8).toString("hex")==="89504e470d0a1a0a"?"png"
    :bytes.subarray(0,3).toString("hex")==="ffd8ff"?"jpg"
    :bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP"?"webp":null;
  if(format!==match[2]||createHash("sha256").update(bytes).digest("hex")!==match[1])throw new Error("COVER_INTEGRITY_MISMATCH");
}
