(() => {
  const M=window.SYS_MODEL,KEY='shiyoushu.app.v4',OLD='shiyoushu.app.v3',ORIGINAL=OLD+'.original';
  const empty=()=>({schemaVersion:4,contentReleaseLastSeen:M.catalog.contentRelease,modifiedAt:new Date().toISOString(),favorites:[],recentViews:[],pinned:null,personalVersions:[],execution:null,timer:null,importedTimers:[],legacyArchive:null});
  let state=empty(),problem='',blocked=false,rawRecovery='';
  // Validate files and browser storage at the boundary. Views use the normal model.
  function validate(s){
    const fail=()=>{throw new Error('这份文件里的做法或记录不完整，请换一份备份。');};
    const text=x=>typeof x==='string';
    const list=(x,fn)=>Array.isArray(x)&&x.every(fn);
    const nonnegative=x=>Number.isFinite(x)&&x>=0;
    const plan=p=>p&&[1,2].includes(p.servings)&&text(p.title)&&['meal','side','soup'].includes(p.mealRole)&&text(p.composition)&&text(p.flavorNote)&&text(p.leftovers)&&
      list(p.ingredients,i=>i&&text(i.id)&&text(i.name)&&Number.isFinite(i.amount)&&i.amount>0&&text(i.unit)&&text(i.householdText)&&text(i.purchaseNote))&&p.ingredients.length>0&&
      list(p.steps,x=>x&&text(x.id)&&text(x.title)&&['prepare','cook','finish'].includes(x.phase)&&list(x.instructions,text)&&list(x.cues,text)&&nonnegative(x.timerSeconds)&&list(x.uses,u=>u&&p.ingredients.some(i=>i.id===u.ingredientId)&&u.fraction>0&&u.fraction<=1))&&p.steps.length>0&&
      list(p.prerequisites,x=>x&&text(x.label))&&list(p.equipment,x=>x&&text(x.id)&&text(x.name)&&x.count>0)&&
      p.time&&list(p.time.totalMinutes,nonnegative)&&p.time.totalMinutes.length===2&&list(p.time.activeMinutes,nonnegative)&&list(p.time.conditions,text)&&
      list(p.troubleshooting,x=>x&&text(x.question)&&text(x.answer))&&
      list(p.flavorOptions,x=>x&&text(x.id)&&text(x.group)&&text(x.label)&&list(x.amounts,a=>a&&p.ingredients.some(i=>i.id===a.ingredientId)&&a.amount>0))&&
      list(p.selectedOptionIds,id=>p.flavorOptions.some(o=>o.id===id))&&list(p.defaultOptionIds,id=>p.flavorOptions.some(o=>o.id===id));
    const snap=x=>x&&text(x.id)&&x.schemaVersion===1&&x.source&&text(x.source.mealId)&&text(x.source.variantId)&&text(x.note)&&plan(x.resolvedPlan);
    const timer=t=>t&&text(t.id)&&text(t.executionId)&&text(t.stepId)&&nonnegative(t.startedAt)&&nonnegative(t.dueAt)&&t.durationSeconds>0;
    if(!s||s.schemaVersion!==4||!text(s.modifiedAt)||!Array.isArray(s.personalVersions))fail();
    if(!s.personalVersions.every(p=>p&&text(p.id)&&text(p.createdAt)&&snap(p.snapshot)))fail();
    const ref=r=>r&&['public','personal'].includes(r.kind)&&text(r.mealId)&&text(r.variantId)&&(r.kind==='public'||s.personalVersions.some(p=>p.id===r.personalId));
    if(!list(s.favorites,ref)||!list(s.recentViews,x=>x&&ref(x.target)&&text(x.viewedAt))||s.recentViews.length>12)fail();
    if(s.pinned&&(!snap(s.pinned.snapshot)||!text(s.pinned.localDateAtPin)))fail();
    if(s.execution&&(!text(s.execution.id)||!snap(s.execution.snapshot)||!text(s.execution.stepId)||!nonnegative(s.execution.offsetPx)))fail();
    if(s.timer&&(!timer(s.timer)||!s.execution||s.timer.executionId!==s.execution.id||!s.execution.snapshot.resolvedPlan.steps.some(x=>x.id===s.timer.stepId)))fail();
    if(!list(s.importedTimers,timer))fail();
    if(s.legacyArchive&&(!text(s.legacyArchive.rawV3)||!list(s.legacyArchive.report,x=>x&&text(x.sourcePath)&&text(x.reason))))fail();
    return s;
  }
  function fromV3(raw){
    const old=JSON.parse(raw);
    if(!old||old.version!==3||!Array.isArray(old.favorites)||!old.versions)throw new Error('这不是食有数的旧版备份。');
    const s=empty(),report=[];
    for(const id of old.favorites){const ref=M.legacyMap[id];if(ref)s.favorites.push(M.clone(ref));report.push({sourcePath:'favorites.'+id,result:ref?'mapped':'readonly',targetId:ref?.mealId||null,reason:ref?'收藏已找回':'先留在旧资料中'});}
    for(const id of Object.keys(old.versions))report.push({sourcePath:'versions.'+id,result:'readonly',targetId:null,reason:'保留原来的配比和备注，可对照当前做法另存。'});
    for(const key of ['drafts','history','shopping','session','meal','evening'])if(old[key])report.push({sourcePath:key,result:'archived',targetId:null,reason:'保存在旧资料中'});
    s.legacyArchive={sourceKey:OLD,rawV3:raw,migratedAt:new Date().toISOString(),report};return s;
  }
  function commit(next){
    const encoded=JSON.stringify(next);
    localStorage.setItem(KEY+'.staging',encoded);
    validate(JSON.parse(localStorage.getItem(KEY+'.staging')));
    localStorage.setItem(KEY,encoded);
    localStorage.removeItem(KEY+'.staging');
  }
  function load(){
    try{
      const raw=localStorage.getItem(KEY);
      if(raw){rawRecovery=raw;state=validate(JSON.parse(raw));rawRecovery='';return;}
      const legacy=localStorage.getItem(ORIGINAL)||localStorage.getItem(OLD);
      if(legacy){
        rawRecovery=legacy;
        if(!localStorage.getItem(ORIGINAL))localStorage.setItem(ORIGINAL,legacy);
        state=fromV3(legacy);commit(state);rawRecovery='';
      }
    }catch(error){blocked=true;problem=rawRecovery?'以前的记录暂时没能打开，可以先导出留一份。':'这个浏览器暂时存不住记录。离开前可以导出一份。';}
  }
  function save(){
    state.modifiedAt=new Date().toISOString();
    if(blocked)return false;
    try{localStorage.setItem(KEY,JSON.stringify(state));problem='';return true;}
    catch(error){problem='这次修改暂时留在页面里，离开前请导出一份。';return false;}
  }
  const exportObject=()=>({format:'shiyoushu-backup',formatVersion:1,exportedAt:new Date().toISOString(),state:M.clone(state)});
  function readImport(raw){
    const obj=JSON.parse(raw);
    let next;
    if(obj.version===3)next=fromV3(raw);
    else if(obj.format==='shiyoushu-backup'&&obj.formatVersion===1)next=validate(obj.state);
    else throw new Error('请选择从食有数导出的备份文件。');
    next=M.clone(next);
    if(next.timer){next.importedTimers.push(next.timer);next.timer=null;}
    return next;
  }
  function replace(next){
    validate(next);commit(next);state=next;blocked=false;problem='';rawRecovery='';
  }
  function recent(target){
    state.recentViews=[{target:M.clone(target),viewedAt:new Date().toISOString()},...state.recentViews.filter(x=>M.refKey(x.target)!==M.refKey(target))].slice(0,12);save();
  }
  load();
  window.SYS_STORE={get state(){return state;},get problem(){return problem;},get rawRecovery(){return rawRecovery;},save,replace,readImport,exportObject,recent};
})();
