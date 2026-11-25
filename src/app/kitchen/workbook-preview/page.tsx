import Link from "next/link";
import {notFound} from "next/navigation";
import {workbookCovers} from "@/server/content/workbook-covers";
import {decimalSource} from "@/domain/content/normalize";
import {Decimal} from "decimal.js";
import RecommendationCard from "../RecommendationCard";

function totalMinutes(prep:unknown,cook:unknown){
  try{
    const first=decimalSource(prep),second=decimalSource(cook);
    return first===null||second===null?null:new Decimal(first).plus(second).toString();
  }catch{return null;}
}

export const dynamic="force-dynamic";

export default async function WorkbookPreview({searchParams}:{searchParams:Promise<{page?:string}>}){
  if(process.env.SHIYOUSHU_DEMO!=="1")notFound();
  const {page}=await searchParams;
  const covers=await workbookCovers();
  const group=Math.max(0,Math.min(Math.ceil(covers.length/3)-1,Number.isSafeInteger(Number(page))?Number(page)-1:0));
  const items=covers.slice(group*3,group*3+3);
  return <main className="kitchen-main kitchen-preview">
    <Link href="/kitchen">‹ 返回厨房</Link>
    <div className="season-heading"><h1>今日食笺</h1><p>表格原图预览 · 菜谱待审核</p></div>
    <div className="recommendation-cards">
      {items.map((item,index)=><RecommendationCard key={item.sourceId} role={index===0?"primary":"alternate"} name={item.name}
        image={"/api/v1/demo-covers/"+item.file} totalMinutes={totalMinutes(item.prep,item.cook)}
        portion={typeof item.portion==="string"?item.portion:undefined} previewSource={`菜谱!${item.cell}`}/>)}
    </div>
    {!items.length&&<p role="status">暂无可预览的表格封面。</p>}
    {covers.length>3&&<div className="actions">
      {group>0&&<Link className="button" href={`?page=${group}`}>上一组</Link>}
      {(group+1)*3<covers.length&&<Link className="button" href={`?page=${group+2}`}>下一组</Link>}
    </div>}
  </main>;
}
