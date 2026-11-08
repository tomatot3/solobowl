(() => {
const M=window.SYS_MODEL,S=window.SYS_STORE,T=window.SYS_TIMER;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(text,action,data='',className='')=>`<button class="button ${className}" type="button" data-action="${action}" ${data}>${text}</button>`;
const href=r=>r.kind==='personal'?`#personal/${encodeURIComponent(r.personalId)}`:`#meal/${encodeURIComponent(r.mealId)}/${encodeURIComponent(r.variantId)}`;
const link=(label,to,cls='')=>`<a class="button ${cls}" href="${to}">${label}</a>`;
const tag=text=>`<span class="tag">${esc(text)}</span>`;
const role=p=>({meal:'一份晚饭',side:'配菜',soup:'汤粥 · 配着吃'}[p.mealRole]);
const minute=r=>r.join('–')+'分钟';
const nowDate=()=>new Date().toLocaleDateString('sv-SE');
function artwork(mealId){const d=M.meta[mealId]||{color:'green',art:'soup',region:'我的做法'};return `<div class="food-art ${d.color}">${window.SYS_ART(d.art,d.color)}<span>${esc(d.region)}</span></div>`;}
function sourceFor(ref){return ref.kind==='personal'?S.state.personalVersions.find(p=>p.id===ref.personalId)?.snapshot:ref;}
const icons={
 time:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
 pot:'<path d="M5 10h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM3 12h2m14 0h2M5 7h14M10 4h4"/>',
 knife:'<path d="m5 19 5-5M4 20l-1-1 6-6 2 2zM10 13 19 4c2 5-1 9-7 11z"/>',
 leaf:'<path d="M5 18C2 9 9 4 20 4c0 10-5 15-12 14M5 21 16 9"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" class="fact-icon" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
function card(ref,featured=false){
 const source=sourceFor(ref);
 if(!source||(!source.resolvedPlan&&!M.variants.has(ref.variantId)))return '<div class="missing-card"><h3>菜谱暂不可用</h3></div>';
 const {resolvedPlan:p}=M.resolveMeal(source);
 const main=p.ingredients.filter(i=>i.isMain&&i.role==='required');
 const pots=p.equipment.filter(e=>['pot','pan','ricecooker'].includes(e.id));
 const potText=pots.some(e=>e.id==='ricecooker')?'电饭煲':pots.reduce((n,e)=>n+e.count,0)+'口锅';
 const cuts=p.equipment.some(e=>e.id==='board');
 const conditions=p.prerequisites.map(x=>({'cooked-rice':'需熟米饭',ricecooker:'需电饭煲','instant-noodle':'用即煮米线'}[x.id]||x.label));
 return `<a class="meal-card ${featured?'featured':''}" href="${href(ref)}">${artwork(ref.mealId)}<div class="card-copy"><div class="card-topline">${tag(p.mealRole==='meal'?p.servings+'人份':role(p))}</div><h3>${esc(p.title)}</h3><div class="card-facts"><span>${icon('time')}约${minute(p.time.totalMinutes)}</span><span>${icon('pot')}${potText}</span><span>${icon('knife')}${cuts?'需切配':'免切配'}</span></div><div class="ingredient-pills">${main.map(i=>`<span>${esc(i.name)}</span>`).join('')}</div>${conditions.length?`<div class="card-conditions">${conditions.map(t=>`<span>${esc(t)}</span>`).join('')}</div>`:''}</div></a>`;
}

function compactSnapshot(snapshot,title,to,actions=''){
 const p=snapshot.resolvedPlan;
 return `<section class="return-card"><div><span class="eyebrow">${title}</span><h2>${esc(p.title)}</h2><p>${p.servings}人份 · ${minute(p.time.totalMinutes)}</p></div><div class="actions">${link('打开做法',to,'primary')}${actions}</div></section>`;
}
function timerBar(){const t=S.state.timer,e=S.state.execution;if(!t||!e)return '';const p=e.snapshot.resolvedPlan,step=p.steps.find(x=>x.id===t.stepId);return `<aside class="timer-banner"><div><span class="small">${esc(p.title)} · ${esc(step.title)}</span><strong data-timer-output>${T.label(t)}</strong><span class="small" data-timer-prompt>${Date.now()>=t.dueAt?'看看锅里的状态。':'切换页面后也继续计时。'}</span></div><div class="actions">${link('回到做法','#cook')}${button('结束计时','stop-timer')}</div></aside>`;}
function results(query,group){const refs=M.search(query,group);return `<div class="section-heading"><h2>${query?`“${esc(query)}”的做法`:group==='全部'?'换换口味':esc(group)}</h2><span>${refs.length}份做法</span></div>${refs.length?`<div class="meal-grid">${refs.map(r=>card(r)).join('')}</div>`:`<div class="empty"><h3>还没找到这道菜</h3><p>换个菜名或食材试试，也可以看看已经整理好的做法。</p>${button('看看其他做法','clear-search','','primary')}</div>`}`;}
function home(query,group){
 const db=S.state,featured=M.search('', '全部').filter(r=>{const p=M.resolveMeal(r).resolvedPlan;return p.mealRole==='meal'&&!p.prerequisites.some(x=>x.required);}).slice(0,2);
 return `<section class="welcome"><div class="eyebrow">一个人的家常饭</div><h1>今晚，吃点什么？</h1></section>
 <form id="search-form" class="search-form" role="search"><label class="sr-only" for="meal-search">找菜名或食材</label><span aria-hidden="true">⌕</span><input id="meal-search" type="search" placeholder="搜菜名 / 食材" value="${esc(query)}" autocomplete="off"><button class="button primary" type="submit">找一找</button></form>
 <div class="ingredient-shortcuts"><span>手边有</span>${['鸡蛋','白菜','番茄','豆腐','面条'].map(x=>button(x,'ingredient',`data-value="${x==='面条'?'面':x}"`,'pill')).join('')}</div>
 ${timerBar()}${db.execution&&!db.timer?compactSnapshot(db.execution.snapshot,'上次看到这里','#cook',button('收起','clear-execution','','quiet')):''}
 ${db.pinned?compactSnapshot(db.pinned.snapshot,db.pinned.localDateAtPin===nowDate()?'留到晚上':'上次留的','#meal/pinned',button('先放一边','unpin','','quiet')):''}
 <div class="browse-tabs" aria-label="做法分类">${['全部','家乡菜','日常饭','时令汤粥'].map(x=>`<button type="button" data-action="group" data-value="${x}" aria-pressed="${group===x}">${x}</button>`).join('')}</div>
 <div id="browse-results">${query||group!=='全部'?results(query,group):`<div class="section-heading"><h2>今晚吃这些</h2></div><div class="featured-grid">${featured.map(r=>card(r,true)).join('')}</div><section class="explore"><div class="section-heading"><h2>熟悉的家常味</h2>${button('多看看','group','data-value="家乡菜"','quiet')}</div><div class="meal-grid">${M.search('','家乡菜').slice(0,3).map(r=>card(r)).join('')}</div></section>`}</div>
 <section class="readings"><div class="section-heading"><h2>厨房随记</h2></div><div class="reading-grid">${window.SYS_CONTENT.articles.map((a,i)=>`<a href="#read/${a.id}" class="reading-card"><span>0${i+1} · 厨房随记</span><h3>${esc(a.title)}</h3><p>${esc(a.intro)}</p><b>读一读 ↗</b></a>`).join('')}</div></section>
 <section id="mine" class="my-section"><div class="section-heading"><h2>我的做法</h2></div>${db.personalVersions.length?`<div class="personal-grid">${db.personalVersions.map(p=>`<div class="personal-item"><a href="#personal/${p.id}"><span class="small">${p.snapshot.resolvedPlan.servings}人份 · ${esc(new Date(p.createdAt).toLocaleDateString('zh-CN'))}</span><h3>${esc(p.snapshot.resolvedPlan.title)}</h3><p>${esc(summary(p.snapshot.resolvedPlan))}</p></a>${button('删除','delete-personal',`data-id="${p.id}"`,'quiet')}</div>`).join('')}</div>`:'<p class="empty-line">还没有保存的做法。</p>'}
 <details ${db.favorites.length?'open':''}><summary>收藏的菜 <span>${db.favorites.length}</span></summary>${db.favorites.length?`<div class="meal-grid">${db.favorites.map(r=>card(r)).join('')}</div>`:'<p>还没有收藏的菜。</p>'}</details>
 ${db.recentViews.length?`<details><summary>最近看过</summary><div class="recent-list">${db.recentViews.map(x=>{const src=sourceFor(x.target);if(!src||(!src.resolvedPlan&&!M.variants.has(x.target.variantId)))return '';const p=M.resolveMeal(src).resolvedPlan;return `<a href="${href(x.target)}">${esc(p.title)} <span>→</span></a>`;}).join('')}</div></details>`:''}
 ${db.legacyArchive?`<p class="old-link">以前留的备注和记录也还在。${button('看看旧资料','legacy','','quiet')}</p>`:''}</section>`;
}
function summary(p){const labels=p.selectedOptionIds.map(id=>p.flavorOptions.find(o=>o.id===id)).filter(o=>!p.defaultOptionIds.includes(o.id)).map(o=>o.label);return labels.length?labels.join('，'):'原味';}
function ingredients(p){return `<ul class="ingredient-list">${p.ingredients.map(i=>`<li><div class="ingredient-name"><strong>${esc(i.name)}</strong>${i.role==='optional'?tag('可以省'):i.flavorKey?tag('主要风味'):''}<span>${M.quantity(i)}</span></div><div class="ingredient-help">${esc(i.householdText)}${i.purchaseNote?`<small>${esc(i.purchaseNote)}</small>`:''}</div></li>`).join('')}</ul>`;}
function adjust(w){const p=w.result.resolvedPlan,groups=[...new Set(p.flavorOptions.map(o=>o.group))];return `${groups.length?`<div class="taste-options">${groups.map(g=>`<label>${{salt:'咸淡',sweet:'甜味',acid:'酸味'}[g]||'口味'}<select data-option-group="${g}">${p.flavorOptions.filter(o=>o.group===g).map(o=>`<option value="${o.id}" ${p.selectedOptionIds.includes(o.id)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`).join('')}</div>`:''}<label class="note-field" for="meal-note">给自己留句话<textarea id="meal-note" placeholder="比如：番茄再炒软一点，出锅多留些汤。">${esc(w.result.note)}</textarea></label>${button('下次按这个做','save-personal','','secondary')}`;}
function detail(w){
 const p=w.result.resolvedPlan,src=w.result.source,display=M.meta[src.mealId],v=M.variants.get(src.variantId),favorite=S.state.favorites.some(r=>r.kind==='public'&&r.mealId===src.mealId&&r.variantId===src.variantId);
 return `<a href="#home" class="back">← 找晚饭</a><div class="detail-hero"><div><div class="eyebrow">${esc(display?.region||'自己的味道')} · ${role(p)}</div><h1>${esc(p.title)}</h1><p class="lead">${esc(p.composition)}</p><div class="meal-facts"><div><strong>${minute(p.time.totalMinutes)}</strong><span>预计用时</span></div><div><strong>${minute(p.time.activeMinutes)}</strong><span>动手时间</span></div><div><strong>${p.servings}人份</strong><span>${esc(summary(p))}</span></div></div><div class="actions">${button('开始做','start','','primary')}${button('留到晚上','pin')}${v?button(favorite?'已收藏':'收藏','favorite',`aria-pressed="${favorite}"`,'quiet'):''}</div></div>${artwork(src.mealId)}</div>
 ${p.prerequisites.length?`<div class="before-cooking"><h2>开做前</h2>${p.prerequisites.map(x=>`<p>${esc(x.label)}</p>`).join('')}${v?.alternatives.length?`<div class="actions">${v.alternatives.map(a=>link(esc(a.reason)+'，看看另一种做法 →',href(M.publicRef(a.targetMealId,a.targetVariantId)),'quiet')).join('')}</div>`:''}</div>`:''}
 <div class="detail-columns"><section><div class="section-heading"><h2>食材</h2>${w.public?`<div class="portion-controls" aria-label="份量">${[1,2].map(n=>`<button type="button" data-action="servings" data-value="${n}" aria-pressed="${p.servings===n}" ${!v.plans[n]?'disabled':''}>${n}人份</button>`).join('')}</div>`:tag(p.servings+'人份 · 我的配比')}</div>${w.public&&!v.plans[2]?'<p class="small">这份做法暂时只有一人份。</p>':''}${ingredients(p)}
 <details class="full-steps"><summary>先看一遍怎么做</summary><ol>${p.steps.map(s=>`<li><strong>${esc(s.title)}</strong><p>${s.instructions.map(esc).join(' ')}</p></li>`).join('')}</ol></details></section>
 <aside><section class="detail-block"><h2>口味</h2>${adjust(w)}${!w.public&&v?`<p class="small">想做两人份，可以打开菜谱里的做法重新选。这里的配比会留着。</p>${link('看菜谱里的做法',href(M.publicRef(src.mealId,src.variantId)),'quiet')}`:''}</section>
 <section class="detail-block"><h2>锅具</h2><div class="equipment-list">${p.equipment.map(e=>tag(e.name+(e.count>1?' × '+e.count:''))).join('')}</div><p class="small">${p.time.conditions.map(esc).join(' ')}</p></section>
 ${v?.alternatives.length?`<section class="detail-block"><h2>缺食材？</h2>${v.alternatives.map(a=>`<a class="alternative" href="${href(M.publicRef(a.targetMealId,a.targetVariantId))}"><strong>${esc(a.reason)} <span>→</span></strong><p>${esc(a.explanation)}</p></a>`).join('')}</section>`:''}
 <section class="detail-block"><h2>小窍门</h2>${p.troubleshooting.map(t=>`<details><summary>${esc(t.question)}</summary><p>${esc(t.answer)}</p></details>`).join('')}</section>
 </aside></div><section class="closing-notes"><div><h2>剩下的材料</h2><p>${esc(p.leftovers)}</p></div>${display?`<div><h2>这道家常味</h2><p>${esc(display.story)}</p><p>${esc(p.flavorNote)}</p></div>`:''}</section><div class="bottom-actions">${button('开始做','start','','primary')}${link('再看看其他饭','#home','quiet')}</div>`;
}
function cooking(){const e=S.state.execution;if(!e)return `<div class="empty"><h1>想好做什么了吗？</h1><p>先挑一份晚饭，材料和做法都在里面。</p>${link('找一份晚饭','#home','primary')}</div>`;
 const snapshot=e.snapshot,p=snapshot.resolvedPlan,phases={prepare:'先把材料备好',cook:'开始下锅',finish:'最后尝尝味道'};let previous='';
 return `<div class="cooking-page"><a class="back" href="#home">← 回到晚饭</a><div class="cook-heading"><div><span class="eyebrow">${p.servings}人份 · ${esc(summary(p))}</span><h1>${esc(p.title)}</h1></div>${button('从头看','from-top','','quiet')}</div>${timerBar()}
 <details class="cook-materials"><summary>用料和锅碗</summary>${ingredients(p)}<p>${p.equipment.map(x=>esc(x.name)).join('、')}</p></details>${p.prerequisites.length?`<p class="cook-prerequisite">${p.prerequisites.map(x=>esc(x.label)).join(' ')}</p>`:''}
 ${snapshot.note?`<p class="personal-note">给自己的提醒：${esc(snapshot.note)}</p>`:''}
 <div class="cooking-steps">${p.steps.map((step,index)=>{const heading=step.phase!==previous?`<h2 class="phase-heading">${phases[step.phase]}</h2>`:'';previous=step.phase;return `${heading}<section class="cook-step" id="step-${step.id}" data-step="${step.id}"><div class="step-number">${String(index+1).padStart(2,'0')}</div><div><h3>${esc(step.title)}</h3>${step.instructions.map(t=>`<p>${esc(t)}</p>`).join('')}<div class="step-ingredients"><span>用到</span>${step.uses.map(u=>{const i=p.ingredients.find(i=>i.id===u.ingredientId);return `<b>${esc(i.name)} ${M.quantity(i,u.fraction)}</b>`;}).join('')}</div>${step.cues.map(c=>`<p class="cook-cue">${esc(c)}</p>`).join('')}${step.timerSeconds?button(`计时${step.timerSeconds/60>=1?`${Math.floor(step.timerSeconds/60)}分${step.timerSeconds%60?step.timerSeconds%60+'秒':''}`:step.timerSeconds+'秒'}`,'timer',`data-step="${step.id}"`,'timer-button'):''}</div></section>`;}).join('')}</div>
 <section class="cook-end"><h2>热乎的时候吃</h2><p>${esc(p.leftovers)}</p>${button('下次按这个做','save-cooking','','secondary')}${link('回到晚饭','#home','quiet')}</section></div>`;
}
function article(id){const a=window.SYS_CONTENT.articles.find(x=>x.id===id);if(!a)return missing();return `<article class="article"><a class="back" href="#home">← 回到晚饭</a><div class="eyebrow">厨房随记</div><h1>${esc(a.title)}</h1><p class="lead">${esc(a.intro)}</p>${a.paragraphs.map(([title,text])=>`<h2>${esc(title)}</h2><p>${esc(text)}</p>`).join('')}<h2>想试试的话</h2><div class="meal-grid">${a.recipes.map(id=>card(M.publicRef(id))).join('')}</div></article>`;}
function missing(){return `<div class="empty"><h1>这份做法暂时找不到了</h1><p>回去看看其他晚饭吧。</p>${link('找晚饭','#home','primary')}</div>`;}
function shell(content,page){return `<div class="shell"><header><a class="brand" href="#home"><span class="seal">食</span><span>食有数<small>一个人的家常饭</small></span></a><nav aria-label="主导航"><a href="#home" ${page==='home'?'aria-current="page"':''}>找晚饭</a><a href="#home/mine">我的做法</a>${button('备份','settings','','quiet')}</nav></header>${S.problem?`<div class="storage-message">${esc(S.problem)} ${button('导出','export','','quiet')}</div>`:''}<main id="main">${content}</main><footer><span>食有数</span>${button('关于与备份','settings','','quiet')}</footer></div>`;}
window.SYS_VIEWS={esc,button,link,href,tag,artwork,card,sourceFor,home,results,detail,cooking,article,missing,shell,nowDate,summary};
})();
