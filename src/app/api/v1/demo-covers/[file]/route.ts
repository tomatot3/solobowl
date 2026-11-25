import {workbookCoverFile} from "@/server/content/workbook-covers";

export async function GET(_request:Request,{params}:{params:Promise<{file:string}>}){
  const {file}=await params;
  const bytes=await workbookCoverFile(file);
  if(!bytes)return new Response(null,{status:404});
  const contentType=file.endsWith(".png")?"image/png":file.endsWith(".jpg")?"image/jpeg":"image/webp";
  return new Response(new Uint8Array(bytes),{headers:{"Content-Type":contentType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
