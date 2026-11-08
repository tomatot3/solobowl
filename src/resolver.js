(() => {
  const {catalog,meta,legacyMap}=window.SYS_CONTENT;
  const meals=new Map(catalog.meals.map(x=>[x.id,x]));
  const variants=new Map(catalog.variants.map(x=>[x.id,x]));
  const clone=x=>structuredClone(x);
  const uid=prefix=>prefix+'-'+crypto.randomUUID();
  function publicRef(mealId,variantId=meals.get(mealId).defaultVariantId){
    return {kind:'public',mealId,variantId,personalId:null};
  }
  function resolveMeal(source,selection={}){
    let result;
    if(source.resolvedPlan)result={source:clone(source.source),resolvedPlan:clone(source.resolvedPlan),note:source.note};
    else {
      const m=meals.get(source.mealId),v=variants.get(source.variantId||m.defaultVariantId);
      const plan=v.plans[selection.servings||1];
      if(!plan)throw new Error('这份做法还没有两人份。');
      result={source:{contentRelease:catalog.contentRelease,mealId:m.id,mealRev:m.rev,variantId:v.id,variantRev:v.rev},resolvedPlan:clone(plan),note:''};
    }
    const p=result.resolvedPlan;
    if(selection.optionIds){
      const chosen=selection.optionIds.map(id=>p.flavorOptions.find(o=>o.id===id));
      if(chosen.some(o=>!o)||new Set(chosen.map(o=>o.group)).size!==chosen.length)throw new Error('请重新选择口味。');
      for(const opt of chosen)for(const x of opt.amounts)p.ingredients.find(i=>i.id===x.ingredientId).amount=x.amount;
      p.selectedOptionIds=[...selection.optionIds];
    }
    if(selection.note!==undefined)result.note=selection.note;
    return result;
  }
  const snapshot=result=>({id:uid('meal'),schemaVersion:1,createdAt:new Date().toISOString(),...clone(result)});
  const quantity=(i,fraction=1)=>`${Number((i.amount*fraction).toFixed(2))}${i.unit}`;
  const refKey=r=>r.kind==='personal'?'personal:'+r.personalId:`public:${r.mealId}:${r.variantId}`;
  function search(query,group='全部'){
    const tokens=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return catalog.meals.flatMap(m=>{
      if(group!=='全部'&&meta[m.id].group!==group)return [];
      let best=null;
      for(const id of m.variantIds){
        const p=variants.get(id).plans[1],title=p.title.toLowerCase();
        const words=[...m.aliases,...m.tags,...p.ingredients.filter(i=>i.isMain).map(i=>i.name)].join(' ').toLowerCase();
        if(!tokens.every(t=>title.includes(t)||words.includes(t)))continue;
        const score=tokens.reduce((n,t)=>n+(title.includes(t)?10:1),0);
        if(!best||score>best.score)best={ref:publicRef(m.id,id),score,rank:m.editorialRank};
      }
      return best?[best]:[];
    }).sort((a,b)=>b.score-a.score||a.rank-b.rank).map(x=>x.ref);
  }
  window.SYS_MODEL={catalog,meta,meals,variants,legacyMap,clone,uid,publicRef,resolveMeal,snapshot,quantity,refKey,search};
})();
