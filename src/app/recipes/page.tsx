import Link from "next/link";
import RecipeSearch from "./RecipeSearch";

export default function Recipes(){
  return <main>
    <div className="page-title"><Link href="/kitchen">‹ 厨房</Link><h1>菜谱</h1></div>
    <div className="kitchen-top"><p className="eyebrow">冬季菜谱</p><Link href="/recipes/favorites">我的收藏 ›</Link></div>
    <RecipeSearch/>
  </main>;
}
