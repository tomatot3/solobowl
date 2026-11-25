import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {z} from "zod";

const directory=resolve(".cache/workbook-covers");
const filename=z.string().regex(/^[a-f0-9]{64}\.(?:jpg|png|webp)$/);
const manifest=z.object({covers:z.array(z.object({
  sourceId:z.string(),name:z.string(),cell:z.string(),file:filename,version:z.string(),
  prep:z.unknown().optional(),cook:z.unknown().optional(),portion:z.unknown().optional(),
}))});

export async function workbookCovers(){
  if(process.env.SHIYOUSHU_DEMO!=="1")return [];
  const raw=await readFile(resolve(directory,"manifest.json"),"utf8").catch(()=>null);
  return raw?manifest.parse(JSON.parse(raw)).covers:[];
}

export async function workbookCoverFile(name:string){
  if(!filename.safeParse(name).success||!(await workbookCovers()).some(cover=>cover.file===name))return null;
  return readFile(resolve(directory,name)).catch(()=>null);
}
