(() => {
'use strict';
const M=window.SYS_MODEL,S=window.SYS_STORE,V=window.SYS_VIEWS,T=window.SYS_TIMER;
const root=document.getElementById('app'),dialog=document.getElementById('panel');
let working=null,activeHash='',page='',query='',group='全部',noticeTimeout,scrollTimeout,pendingImport=null;
const db=()=>S.state;
function toast(text){const n=document.getElementById('notice');n.textContent=text;n.classList.add('show');clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>n.classList.remove('show'),3800);}
function persist(message){const ok=S.save();toast(ok?message:S.problem);return ok;}
function go(hash){if(location.hash===hash)render();else location.hash=hash;}
function showPanel(title,body){dialog.innerHTML=`<div class="panel-heading"><h2>${V.esc(title)}</h2><button type="button" class="icon-button" data-panel="close" aria-label="关闭">×</button></div><div class="panel-body">${body}</div>`;if(!dialog.open)dialog.showModal();}
function ask(title,text,yes='确定',no='先不换'){
 return new Promise(resolve=>{
  showPanel(title,`<p>${V.esc(text)}</p><div class="actions"><button class="button primary" data-panel="yes">${V.esc(yes)}</button><button class="button" data-panel="close">${V.esc(no)}</button></div>`);
  let accepted=false;
  const click=e=>{if(e.target.closest('[data-panel="yes"]')){accepted=true;dialog.close();}};
  dialog.addEventListener('click',click);dialog.addEventListener('close',()=>{dialog.removeEventListener('click',click);resolve(accepted);},{once:true});
 });
}
function getWorking(parts){
 const [type,id,variantId]=parts;let base,ref=null,parentId=null,isPublic=false;
 if(type==='personal'){const personal=db().personalVersions.find(p=>p.id===id);if(!personal)return null;base=personal.snapshot;parentId=id;ref={kind:'personal',mealId:base.source.mealId,variantId:base.source.variantId,personalId:id};}
 else if(id==='pinned'){if(!db().pinned)return null;base=db().pinned.snapshot;}
 else if(id==='current'){if(!db().execution)return null;base=db().execution.snapshot;}
 else {const meal=M.meals.get(id);if(!meal)return null;const v=variantId||meal.defaultVariantId;if(!M.variants.has(v)||M.variants.get(v).mealId!==id)return null;ref=M.publicRef(id,v);base=ref;isPublic=true;}
 const result=M.resolveMeal(base);if(ref)S.recent(ref);
 return {base,ref,parentId,public:isPublic,result,cached:base.resolvedPlan?M.clone(base):null};
}
function snap(){if(!working.cached)working.cached=M.snapshot(working.result);return M.clone(working.cached);}
function captureReading(){
 if(page!=='cook'||!db().execution)return;
 const steps=[...root.querySelectorAll('[data-step].cook-step')];
 const selected=steps.filter(x=>x.getBoundingClientRect().top<=120).pop()||steps[0];
 if(selected){db().execution.stepId=selected.dataset.step;db().execution.offsetPx=Math.max(0,-selected.getBoundingClientRect().top);db().execution.viewedAt=new Date().toISOString();}
}
function restoreReading(){const e=db().execution;if(!e)return;const node=document.getElementById('step-'+e.stepId);if(node)window.scrollTo(0,node.getBoundingClientRect().top+window.scrollY+e.offsetPx-20);}
function render(keepPosition=false){
 const hash=location.hash||'#home',parts=hash.slice(1).split('/').map(decodeURIComponent),changed=activeHash!==hash;
 if(changed){working=null;activeHash=hash;}
 const [type,id]=parts;page=type;
 if(type==='meal'&&!id){go(db().pinned?'#meal/pinned':'#home');return;}
 let content;
 if(type==='home'){content=V.home(query,group);}
 else if(type==='meal'||type==='personal'){if(!working)working=getWorking(parts);content=working?V.detail(working):V.missing();}
 else if(type==='cook')content=V.cooking();
 else if(type==='read')content=V.article(id);
 else if(type==='recipe'&&M.legacyMap[id]){go(V.href(M.legacyMap[id]));return;}
 else if(type==='article'){go('#read/'+id);return;}
 else if(['recipes','book','shopping','finish','review','about'].includes(type)){go(type==='book'?'#home/mine':'#home');if(type==='review')legacyPanel();if(type==='about')settingsPanel();return;}
 else content=V.missing();
 root.innerHTML=V.shell(content,type);document.title=(working?working.result.resolvedPlan.title+' · ':'')+'食有数';
 if(!keepPosition){window.scrollTo(0,0);if(type==='cook'&&db().execution)requestAnimationFrame(restoreReading);if(type==='home'&&id==='mine')requestAnimationFrame(()=>document.getElementById('mine').scrollIntoView());}
 tick();
}
function refreshSearch(){document.getElementById('browse-results').innerHTML=V.results(query,group);}
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportRecords(){download(JSON.stringify(S.exportObject(),null,2),'食有数-我的做法-'+V.nowDate()+'.json');}
function settingsPanel(){showPanel('备份与恢复',`<p>收藏、自己的配比和上次看到的位置，都存在这个浏览器里。换设备前，导出一份就能带走。</p><div class="actions">${V.button('导出我的做法','export','','primary')}<label class="button file-label">导入备份<input type="file" id="import-file" accept="application/json,.json"></label></div>${S.rawRecovery?`<p>${V.esc(S.problem)}</p>${V.button('导出原来的文件','export-original')}`:''}${db().legacyArchive?`<div class="panel-section"><h3>以前的资料</h3><p>旧版留下的备注、配比和记录都可以找回。</p>${V.button('查看旧资料','legacy')}${V.link('打开旧版',location.protocol==='file:'?'legacy-v3/index.html':'/legacy-v3/','quiet')}</div>`:''}${db().importedTimers.length?`<details><summary>备份里带来的计时</summary>${db().importedTimers.map(t=>`<p>${new Date(t.startedAt).toLocaleString('zh-CN')} · ${Math.round(t.durationSeconds/60)}分钟 · 已留作记录</p>`).join('')}</details>`:''}<div class="panel-section"><h3>关于食有数</h3><p>给一个人的晚饭，整理一些做得来的家常味。材料怎么用、先做哪一步、少了什么可以换，尽量说清楚。</p><p>菜谱的时间是编辑估计，包含备菜。不同锅具和面条需要的时间，做法里会单独交代。</p><p class="small">这一版用整理好的菜谱与调味选项，暂未接入AI。固定浏览器地址能保留记录；换地址或换设备时，用导出和导入接着用。</p></div>`);}
function legacyPanel(){const archive=db().legacyArchive;if(!archive){toast('这里还没有旧资料。');return;}const old=JSON.parse(archive.rawV3),versions=old.versions||{},labels={normal:'原来的量',less:'少一点',more:'多一点',none:'不放'};
 showPanel('以前留下的做法',`<p>原来的配比和备注先留在这里。想接着调整，可以打开现在的做法，对照着再存一份。</p>${Object.entries(versions).map(([id,item])=>{const ref=M.legacyMap[id],prefs=item.prefs||{};const title=ref?M.resolveMeal(ref).resolvedPlan.title:id;return `<section class="old-version"><h3>${V.esc(title)}</h3><p>${prefs.servings||1}人份 · ${['salt','acid','chili','sweet'].filter(k=>prefs[k]).map(k=>`${{salt:'咸淡',acid:'酸味',chili:'辣味',sweet:'甜味'}[k]}：${labels[prefs[k]]||V.esc(prefs[k])}`).join('，')}</p>${prefs.note?`<p class="personal-note">${V.esc(prefs.note)}</p>`:''}${ref?`<a href="${V.href(ref)}" class="button" data-panel="close">对照现在的做法</a>`:''}</section>`;}).join('')||'<p>旧版没有另存的私人做法。</p>'}<details><summary>原来的完整记录</summary><pre>${V.esc(JSON.stringify(old,null,2))}</pre></details><div class="actions">${V.button('导出旧资料','export-legacy')}</div>`);
}
function storePersonal(snapshot,parentId){const personal={id:M.uid('personal'),createdAt:new Date().toISOString(),snapshot:M.clone(snapshot),parentPersonalId:parentId||null};db().personalVersions.unshift(personal);persist('已保存到我的做法');return personal;}
async function act(b){
 const action=b.dataset.action;
 if(action==='ingredient'){query=b.dataset.value;group='全部';render(true);document.getElementById('meal-search').focus();}
 else if(action==='group'){group=b.dataset.value;render(true);}
 else if(action==='clear-search'){query='';group='全部';render();}
 else if(action==='servings'){
  working.result=M.resolveMeal(working.base,{servings:Number(b.dataset.value),optionIds:working.result.resolvedPlan.selectedOptionIds,note:working.result.note});working.cached=null;render(true);
 }
 else if(action==='favorite'){
  const src=working.result.source,ref=M.publicRef(src.mealId,src.variantId),key=M.refKey(ref),found=db().favorites.some(r=>M.refKey(r)===key);
  db().favorites=found?db().favorites.filter(r=>M.refKey(r)!==key):[ref,...db().favorites];persist(found?'已取消收藏':'已收藏');render(true);
 }
 else if(action==='pin'){
  const snapshot=snap();if(db().pinned&&db().pinned.snapshot.id!==snapshot.id){if(!await ask('晚上改吃这份？',`原来留的是${db().pinned.snapshot.resolvedPlan.title}，换成${snapshot.resolvedPlan.title}。`,'换成这份'))return;}
  db().pinned={snapshot,pinnedAt:new Date().toISOString(),localDateAtPin:V.nowDate()};persist('已留到晚上');
 }
 else if(action==='unpin'){db().pinned=null;S.save();render(true);}
 else if(action==='save-personal'){const personal=storePersonal(snap(),working.parentId);working.parentId=personal.id;}
 else if(action==='save-cooking'){storePersonal(db().execution.snapshot,null);}
 else if(action==='delete-personal'){
  const p=db().personalVersions.find(x=>x.id===b.dataset.id);
  if(!await ask('删掉这份做法？',p.snapshot.resolvedPlan.title+'，'+p.snapshot.resolvedPlan.servings+'人份。','删除','留着'))return;
  db().personalVersions=db().personalVersions.filter(x=>x.id!==p.id);db().favorites=db().favorites.filter(x=>x.personalId!==p.id);db().recentViews=db().recentViews.filter(x=>x.target.personalId!==p.id);persist('这份做法已删除。');render(true);
 }
 else if(action==='start'){
  if(db().timer&&!await ask('还有一个计时没结束',`先结束${db().execution.snapshot.resolvedPlan.title}的计时，再开始这份。`,'结束计时，开始这份','回到原做法')){go('#cook');return;}
  db().timer=null;const snapshot=snap();db().execution={id:M.uid('cook'),snapshot,stepId:snapshot.resolvedPlan.steps[0].id,offsetPx:0,viewedAt:new Date().toISOString()};S.save();go('#cook');
 }
 else if(action==='clear-execution'){db().execution=null;S.save();render(true);}
 else if(action==='from-top'){const first=db().execution.snapshot.resolvedPlan.steps[0];db().execution.stepId=first.id;db().execution.offsetPx=0;S.save();document.getElementById('step-'+first.id).scrollIntoView({behavior:'smooth',block:'start'});}
 else if(action==='timer'){
  const e=db().execution,step=e.snapshot.resolvedPlan.steps.find(x=>x.id===b.dataset.step);
  if(db().timer&&!await ask('换一个计时？','当前的计时会结束，从这一步重新计时。','重新计时','接着原来的'))return;
  captureReading();T.start(e,step);render(true);toast('计时开始了。');
 }
 else if(action==='stop-timer'){T.stop();render(true);}
 else if(action==='settings')settingsPanel();
 else if(action==='legacy')legacyPanel();
 else if(action==='export')exportRecords();
 else if(action==='export-original')download(S.rawRecovery,'食有数-原始记录.json');
 else if(action==='export-legacy')download(db().legacyArchive.rawV3,'食有数-旧资料.json');
 else if(action==='confirm-import'){
  exportRecords();
  try{S.replace(pendingImport);pendingImport=null;dialog.close();working=null;activeHash='';go('#home');toast('导入好了。原来的记录也已导出一份。');}
  catch(error){toast('这次没能存进去，原来的记录还在。请检查浏览器的存储设置。');}
 }
}
root.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)void act(b);});
dialog.addEventListener('click',e=>{const close=e.target.closest('[data-panel="close"]');if(close)dialog.close();const b=e.target.closest('[data-action]');if(b)void act(b);});
root.addEventListener('submit',e=>{if(e.target.id==='search-form'){e.preventDefault();query=document.getElementById('meal-search').value;refreshSearch();}});
root.addEventListener('input',e=>{if(e.target.id==='meal-search'){query=e.target.value;refreshSearch();}else if(e.target.id==='meal-note'){working.result.note=e.target.value;working.cached=null;}});
root.addEventListener('change',e=>{if(e.target.dataset.optionGroup){const p=working.result.resolvedPlan,selected=p.selectedOptionIds.filter(id=>p.flavorOptions.find(o=>o.id===id).group!==e.target.dataset.optionGroup);selected.push(e.target.value);working.result=M.resolveMeal(working.base,{servings:p.servings,optionIds:selected,note:working.result.note});working.cached=null;render(true);}});
dialog.addEventListener('change',async e=>{
 if(e.target.id!=='import-file'||!e.target.files.length)return;
 try{pendingImport=S.readImport(await e.target.files[0].text());showPanel('把这份做法带回来',`<p>备份里有${pendingImport.personalVersions.length}份自己的做法、${pendingImport.favorites.length}项收藏${pendingImport.legacyArchive?'，还有以前的资料':''}。</p><p>导入后会换成这份记录。现在的记录会先导出一份，方便留存。</p><div class="actions">${V.button('导入这份备份','confirm-import','','primary')}<button class="button" data-panel="close">先不导入</button></div>`);}
 catch(error){showPanel('这份备份没能打开',`<p>${V.esc(error instanceof SyntaxError?'文件内容读不出来，请选择从食有数导出的JSON备份。':error.message)}</p><button class="button" data-panel="close">知道了</button>`);}
});
function tick(){const t=db().timer;if(!t)return;for(const el of document.querySelectorAll('[data-timer-output]'))el.textContent=T.label(t);for(const el of document.querySelectorAll('[data-timer-prompt]'))el.textContent=Date.now()>=t.dueAt?'时间到了，看看锅里的状态。':'切换页面后也继续计时。';}
window.addEventListener('scroll',()=>{if(page==='cook'){captureReading();clearTimeout(scrollTimeout);scrollTimeout=setTimeout(()=>S.save(),400);}},{passive:true});
window.addEventListener('hashchange',()=>{clearTimeout(scrollTimeout);captureReading();if(page==='cook')S.save();render();});
window.addEventListener('pagehide',()=>{captureReading();S.save();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){captureReading();S.save();}else tick();});
setInterval(tick,1000);render();
})();
