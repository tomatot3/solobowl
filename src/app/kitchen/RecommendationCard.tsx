import Link from "next/link";
import RecipeCover from "../RecipeCover";

export default function RecommendationCard({name,image,totalMinutes,portion,role,reason,href,previewSource}: {
  name:string;image?:string|null;totalMinutes:string|null;portion?:string;role:string;reason?:string;href?:string;previewSource?:string;
}) {
  return <article className={`panel recommendation-card${role==="primary"?" recommendation-primary":""}${image?" has-cover":""}`}>
    <div className="recommendation-copy">
      <p className="eyebrow">{previewSource?(role==="primary"?"主推样式":"备选样式"):(role==="primary"?"今日主推":"备选")}</p>
      <h3>{name}</h3>
      <div className="recipe-meta">
        {portion&&<span>{portion}</span>}
        <span>{totalMinutes===null?"耗时待确认":totalMinutes+" 分钟"}</span>
      </div>
      {href&&<Link className="button" aria-label={"查看"+name} href={href}>查看食谱 →</Link>}
    </div>
    <RecipeCover image={image} name={name}/>
    {reason&&<p className="recommendation-reason"><strong>推荐理由</strong> {reason}</p>}
    {previewSource&&<p className="recommendation-reason"><strong>原图位置</strong> {previewSource}</p>}
  </article>;
}
