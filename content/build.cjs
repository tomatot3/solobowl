// Editorial source. Run to rebuild content.js; the browser consumes complete plans.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const old={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../legacy-v3/recipes.js'),'utf8'),old);
const originals=old.window.SYS_RECIPES;
const ids={suantang:['recipe-suantang','meal-suantang','suantang-tofu'],tomato:['recipe-tomato-egg','meal-tomato-rice','tomato-egg-rice'],potato:['recipe-potato','dish-potato','potato-sour-spicy'],scallion:['recipe-scallion-noodle','meal-scallion-noodle','scallion-oil-noodle'],sesame:['recipe-sesame-noodle','meal-sesame-noodle','sesame-noodle'],cabbage:['recipe-cabbage','meal-cabbage','cabbage-egg-clear'],mushroom:['recipe-mushroom-rice','meal-mushroom-rice','mushroom-greens-rice'],pumpkin:['recipe-pumpkin-millet','soup-pumpkin-millet','pumpkin-millet-porridge'],radish:['recipe-radish-tofu','soup-radish-tofu','radish-tofu-soup'],lotus:['recipe-lotus-mushroom','soup-lotus-mushroom','lotus-mushroom-soup'],'egg-soup':['recipe-seaweed-egg','soup-seaweed-egg','seaweed-egg-soup'],'pepper-tofu':['recipe-pepper-tofu','meal-pepper-tofu-rice','pepper-tofu-rice']};
const step=(id,phase,title,text,uses,seconds=0,cues=[])=>({id,phase,title,instructions:Array.isArray(text)?text:[text],uses:uses.map(x=>({ingredientId:Array.isArray(x)?x[0]:x,fraction:Array.isArray(x)?x[1]:1})),cues,timerSeconds:seconds});
const steps={
suantang:[step('prepare','prepare','豆腐切块，青菜洗好','选包装注明可直接煮的米线。豆腐切成小块，青菜洗净，菜梗和菜叶分开。',['noodle','tofu','greens']),step('broth','cook','先煮一锅酸汤','锅里放油，小火炒匀酸汤底料，再加水煮开。底料浓淡先看包装建议。',['oil','base','water'],180,['底料散开，汤重新沸腾。']),step('noodles','cook','放米线和豆腐','放入米线和豆腐，小火煮制。米线按包装标注的时间煮，豆腐用勺背轻轻推开。',['noodle','tofu'],300,['夹起一根米线尝口感，里面没有硬芯；豆腐热透。']),step('greens','finish','青菜烫熟就能吃','先下菜梗，接着放菜叶。喜欢糊辣椒的香味，盛碗前撒一点。',['greens','chili'],120,['菜梗能夹断，菜叶软下来。先尝汤，再决定要不要补调味。'])],
tomato:[step('prepare','prepare','先备好热饭和番茄','番茄洗净切块，鸡蛋打散。热米饭盛到餐碗里，放在一旁。',['rice','tomato','egg']),step('egg','cook','鸡蛋刚凝固就盛出','锅中放一半油，中火加热，倒入蛋液，轻推成块。凝固后盛入干净的碗。',['egg',['oil',.5]],120,['蛋液凝固成块，表面还柔软。打蛋碗洗净后可用来盛熟蛋。']),step('tomato','cook','把番茄炒出汤汁','锅里加余下的油，放番茄炒软。加水、盐和糖，小火煮出汁。',['tomato',['oil',.5],'water','salt','sugar'],240,['番茄边缘变软，锅底有红色汤汁。喜欢番茄原本的酸味，可以省糖。']),step('serve','finish','鸡蛋回锅，浇到饭上','把炒好的鸡蛋倒回锅中，轻轻拌匀，烧至热透，连汤汁一起盛到米饭上。',['egg','rice'],60,['鸡蛋内部熟透，汤汁能裹住蛋块。'])],
potato:[step('prepare','prepare','土豆切好再开火','土豆去皮切成均匀细丝，冲掉表面淀粉后沥干。蒜切末，干辣椒剪成小段。',['potato','garlic','chili']),step('aroma','cook','先炒出蒜和辣椒香','锅中加油，中小火加热，放蒜和干辣椒，略炒出香味。',['oil','garlic','chili'],30,['闻到香味就下土豆，别等辣椒变黑。']),step('stir','cook','土豆丝快炒','放入土豆丝，转中大火翻炒，加入一半米醋。粘锅时沿边加少量水。',['potato',['vinegar',.5]],240,['土豆丝颜色透亮，尝一根没有生硬芯。']),step('season','finish','出锅前补上酸味','加入盐和余下的米醋，翻匀后盛出。',['salt',['vinegar',.5]],30,['配一碗热饭吃；米饭需要另备。'])],
scallion:[step('prepare','prepare','切葱，调好酱汁','小葱洗净擦干，切段。生抽和糖放到小碗中拌匀。',['scallion','soy','sugar']),step('noodles','cook','煮好面，留一点面汤','锅中放足够盖过面条的水，按包装说明煮面。捞进餐碗，留出面汤。倒空锅里的水，擦干锅面。',['noodle','water'],300,['面条没有硬芯。锅面擦干后再放油。']),step('scallion','cook','小火慢慢煎葱','锅中放油和葱段，用小火慢煎。葱段变金黄时关火。',['oil','scallion'],180,['葱段边缘金黄、闻到葱香即可，余温还会让颜色加深。']),step('mix','finish','把面拌开','待油温稍降，加入调好的酱汁和面汤。先取一部分拌面，尝味后再加余下的。',['soy','sugar','water','noodle'],0,['面条能用筷子轻松挑散，表面裹上一层葱油。'])],
sesame:[step('prepare','prepare','切一点黄瓜丝','黄瓜洗净切细丝，面条放到手边。',['cucumber','noodle']),step('sauce','prepare','芝麻酱分次加水调开','温水分几次加入芝麻酱，每次搅匀后再加。拌入生抽、米醋和辣椒油。',['water','sesame','soy','vinegar','chili'],0,['能顺着勺背缓缓流下就可以了。辣椒油可以省。']),step('noodles','cook','煮面','锅里加足够的水烧开，按包装说明煮面。煮好捞出，用筷子挑散。',['noodle'],300,['面条没有硬芯，沥掉多余水分。']),step('mix','finish','拌匀就吃','面条放进餐碗，加黄瓜丝和调好的酱汁，趁热拌匀。太稠时补一点温水。',['cucumber','noodle','sesame'],0,['芝麻酱均匀裹住面条。'])],
cabbage:[step('prepare','prepare','白菜帮和叶分开放','白菜洗净，菜帮切细，菜叶切小块，分开放。鸡蛋在小碗里打散。',['cabbage','egg']),step('boil','cook','先煮菜帮和面条','锅里加水烧开，放菜帮和挂面。面条按包装说明煮。',['water','cabbage','noodle'],240,['用筷子松开面条，水重新沸腾后稍微调小火。']),step('egg','cook','最后放菜叶和蛋液','面条快熟时下菜叶，随后缓缓淋入刚才打散的蛋液。等凝固后再轻轻推开。',['cabbage','egg'],120,['菜帮能夹断，面条没有硬芯，蛋液完全凝固。']),step('season','finish','调味盛碗','加盐和香油，搅匀尝味，关火盛碗。',['salt','oil'],0,['汤面做好就吃，放久了面条会继续吸汤。'])],
mushroom:[step('prepare','prepare','淘米，香菇切丁','大米淘洗沥水。鲜香菇切丁，青菜洗净切碎，放在另一个碗里。',['rice','mushroom','greens']),step('rice','cook','米和香菇先焖','米和香菇放进电饭煲，加水、生抽和油，搅匀后启动煮饭程序。水量和最低米量看机器说明。',['rice','mushroom','water','soy','oil'],1800,['以电饭煲程序结束为准，页面计时方便回来看看。']),step('greens','cook','饭熟后再加青菜','打开锅盖，拌入青菜。合盖，用机器支持的加热功能继续加热。',['greens'],300,['青菜颜色变深、菜梗软熟；确认机器仍在加热。']),step('serve','finish','翻松盛出','确认米饭没有硬芯，青菜熟透，用饭勺翻松，盛到碗里。',['rice','greens'],0,['内胆稍微放凉再洗，会轻松一点。'])],
pumpkin:[step('prepare','prepare','南瓜切小块','小米淘洗一遍，去皮南瓜切成均匀小块。',['millet','pumpkin']),step('boil','cook','水开后下米和南瓜','深锅里加水烧开，放入小米和南瓜，轻轻搅开。',['water','millet','pumpkin'],180),step('simmer','cook','小火慢慢煮','转小火，锅盖留一道缝。隔一会儿搅一下锅底，太稠时补热水。',['millet','pumpkin'],1200,['米粒开花，南瓜能用勺背轻松压碎。']),step('serve','finish','压碎几块南瓜','压碎一部分南瓜拌进粥里，尝尝甜味。喜欢稀一些就补热水，再煮开。',['pumpkin'],120,['靠南瓜本身的甜味就可以很好喝。'])],
radish:[step('prepare','prepare','萝卜切薄片','白萝卜去皮切薄片，豆腐切块，姜切丝。',['radish','tofu','ginger']),step('radish','cook','萝卜先煮软','锅里放水、姜和萝卜，烧开后转中小火。',['water','ginger','radish'],600,['萝卜变得透明，筷子能轻松夹断。']),step('tofu','cook','轻轻放入豆腐','把豆腐滑入汤中，保持小火，少翻动。',['tofu'],180,['豆腐内部热透，汤保持微沸。']),step('season','finish','加盐和香油','加盐、香油，轻轻搅匀，尝味后盛出。',['salt','oil'])],
lotus:[step('prepare','prepare','莲藕切片，香菇切块','莲藕洗净去皮切薄片，鲜香菇洗净切块，姜切片。',['lotus','mushroom','ginger']),step('boil','cook','一起入锅','莲藕、香菇和姜放进锅中，加水和油，大火煮开。',['lotus','mushroom','ginger','water','oil'],180),step('simmer','cook','煮到喜欢的口感','转中小火继续煮。水少时补热水，夹一片莲藕尝尝软度。',['lotus','mushroom'],1200,['香菇充分熟透。脆藕煮熟后仍会带脆感，粉藕更容易煮软。']),step('season','finish','加盐盛出','加盐搅匀，尝味后盛出。',['salt'])],
'egg-soup':[step('prepare','prepare','把蛋打散','鸡蛋打散，紫菜按包装说明处理。',['egg','seaweed']),step('seaweed','cook','水开后下紫菜','锅中加水烧开，放紫菜，煮到散开。',['water','seaweed'],60),step('egg','cook','缓缓淋入蛋液','保持汤微沸，沿锅边淋入蛋液。凝固后轻轻推开，再煮至熟透。',['egg'],120,['蛋液完全凝固，形成柔软的蛋花。']),step('season','finish','调味盛出','加盐和香油，拌匀后盛出。香油可以省。',['salt','oil'])],
'pepper-tofu':[step('prepare','prepare','豆腐擦干，青椒切块','豆腐切成厚块，擦干表面。青椒去籽切块，热米饭盛到碗里。',['tofu','pepper','rice']),step('tofu','cook','把豆腐煎到微黄','锅里放油，中小火加热后下豆腐。底面定型后再翻面。',['oil','tofu'],360,['两面微黄，能完整翻起即可。']),step('pepper','cook','加青椒一起烧','加入青椒轻轻翻炒，再放生抽和水，盖上锅盖小火烧。',['pepper','soy','water'],180,['青椒熟透，豆腐吸进一些汤汁。']),step('serve','finish','留一点汁拌饭','揭盖收掉一些汤汁，连豆腐一起盛到热米饭上。',['rice'],60,['锅底还留少量汤汁，拌饭正合适。'])]
};
const doubles={suantang:[160,300,180,50,900,8,1.5],tomato:[300,380,4,14,1.8,3,50],potato:[380,8,1.5,14,1.8,14],scallion:[160,35,16,14,3,35],sesame:[160,28,150,10,8,45,3],cabbage:[160,280,2,1000,1.8,3],mushroom:[140,150,180,200,10,8],pumpkin:[80,280,1000],radish:[340,280,5,900,1.8,3],lotus:[300,150,5,1000,1.8,5],'egg-soup':[5,2,600,.9,1.5],'pepper-tofu':[340,150,300,14,14,100]};
const times={suantang:[[20,30],[25,35],[10,15],[12,18]],tomato:[[15,25],[20,30],[12,18],[15,22]],potato:[[20,30],[25,35],[15,22],[20,28]],scallion:[[20,25],[20,30],[10,15],[12,18]],sesame:[[15,20],[18,25],[8,12],[10,15]],cabbage:[[15,25],[18,30],[8,12],[10,15]],mushroom:[[40,55],[40,60],[10,15],[12,18]],pumpkin:[[30,40],[35,45],[8,12],[10,15]],radish:[[25,35],[30,40],[8,12],[10,15]],lotus:[[30,45],[35,50],[10,15],[12,18]],'egg-soup':[[8,12],[10,15],[5,8],[6,10]],'pepper-tofu':[[20,30],[25,35],[15,20],[18,25]]};
const tools={pot:'汤锅',pan:'炒锅',bowl:'餐碗',board:'刀和砧板',utensil:'筷子和勺子',egg:'打蛋碗',sauce:'调汁碗',ricecooker:'电饭煲',wash:'洗菜盆'};
const gear={suantang:['pot','bowl','board','utensil'],tomato:['pan','bowl','board','utensil','egg'],potato:['pan','bowl','board','utensil','wash'],scallion:['pot','bowl','board','utensil','sauce'],sesame:['pot','bowl','board','utensil','sauce'],cabbage:['pot','bowl','board','utensil','egg'],mushroom:['ricecooker','bowl','board','utensil'],pumpkin:['pot','bowl','board','utensil'],radish:['pot','bowl','board','utensil'],lotus:['pot','bowl','board','utensil'],'egg-soup':['pot','bowl','egg','utensil'],'pepper-tofu':['pan','bowl','board','utensil']};
const buy={noodle:'挂面买一包就能分几次用，取够这一顿的量。',cabbage:'选小棵或按份售卖的白菜，剩下的留着下顿用。',egg:'按个拿就好。',tomato:'散买一两个，大小不同就按手边的番茄调整。',tofu:'优先选小盒；嫩豆腐煮汤，老豆腐更好煎。',rice:'这里用热米饭，家里没备饭时可以看看汤面。',base:'买适合煮汤的酸汤底料，按包装建议的浓度调。',sesame:'选小瓶就够，看看配料里有没有花生。',pumpkin:'可以买切好的小块南瓜。',mushroom:'这里用鲜香菇，买几朵就够。'};
function household(id,n,unit){
 if(id==='egg')return `${n}个`;
 if(id==='noodle')return n<100?'约500克一包的六分之一':'约500克一包的三分之一';
 if(id==='cabbage')return n<200?'两三片白菜叶':'四五片白菜叶';
 if(id==='tomato')return n<250?'约1个大番茄':'约2个大番茄';
 if(id==='tofu')return '按包装净重切一部分';
 if(id==='salt')return '一点点加，尝过再补';
 if(id==='water')return '有刻度的水杯量起来方便';
 if(id==='potato')return n<250?'约1个中等土豆':'约2个中等土豆';
 if(id==='rice')return `${n<200?'约一':'约两'}小碗`;
 if(['soy','oil','vinegar'].includes(id))return '普通小茶匙一平匙约5毫升';
 if(id==='scallion')return '一小把';
 if(id==='greens')return n<150?'一小把':'两小把';
 if(id==='mushroom')return n<100?'约4朵鲜香菇':'约7至8朵鲜香菇';
 return `${n}${unit}左右`;
}
const mainIds=new Set(['rice','noodle','tofu','tomato','egg','potato','scallion','sesame','cucumber','cabbage','mushroom','greens','pumpkin','millet','radish','lotus','seaweed','pepper','base']);
const dishes=['potato'],soups=['pumpkin','radish','lotus','egg-soup'];
const catalog={schemaVersion:1,contentRelease:'2026.11.08.2',recipes:[],meals:[],variants:[]},meta={},legacyMap={};
for(const r of originals){
 const [recipeId,mealId,variantId]=ids[r.id],role=dishes.includes(r.id)?'side':soups.includes(r.id)?'soup':'meal';
 const raw=r.ingredients.filter(i=>!(r.id==='potato'&&i[0]==='rice'));
 const plans={};
 for(const servings of [1,2]){
  const ingredients=raw.map((i,index)=>{const n=servings===1?i[2]:doubles[r.id][index];return {id:i[0],name:r.id==='suantang'&&i[0]==='noodle'?'即煮米线':i[1],role:['chili','sugar'].includes(i[0])||(['radish','lotus'].includes(r.id)&&i[0]==='ginger')?'optional':'required',isMain:mainIds.has(i[0]),flavorKey:i[4]==='key'||(r.id==='sesame'&&i[0]==='sesame')||(r.id==='scallion'&&i[0]==='scallion'),amount:n,unit:i[3],householdText:r.id==='mushroom'&&i[0]==='rice'?'用电饭煲量杯和最低米量作参照':household(i[0],n,i[3]),purchaseNote:i[0]==='water'?'':r.id==='mushroom'&&i[0]==='rice'?'这里用生米，先看电饭煲能否煮这一份。':buy[i[0]]||(['oil','salt','soy','vinegar','sugar','chili'].includes(i[0])?'常用调料，家里有就用手边的。':'散买或选小份包装即可。')};});
  const opts=[];
  for(const i of raw.filter(i=>['salt','sweet','acid'].includes(i[4]))){const material=ingredients.find(x=>x.id===i[0]),normal=material.amount,group=i[4];opts.push({id:group+'-normal',group,label:'原来的味道',amounts:[{ingredientId:i[0],amount:normal}]},{id:group+'-less',group,label:group==='salt'?'淡一点':group==='sweet'?'少甜一点':'少酸一点',amounts:[{ingredientId:i[0],amount:Number((normal*.7).toFixed(1))}]});}
  const pre=[];
  if(['tomato','pepper-tofu'].includes(r.id))pre.push({id:'cooked-rice',label:'需要现成热米饭；现煮米饭的时间另算。',required:true});
  if(r.id==='suantang')pre.push({id:'instant-noodle',label:'这份用即煮米线。需要泡发的干米线，先按包装泡好再做。',required:true});
  if(r.id==='mushroom')pre.push({id:'ricecooker',label:'电饭煲能煮这一份米量，并支持饭熟后继续加热。',required:true});
  plans[servings]={servings,title:r.name,mealRole:role,composition:role==='meal'?(r.id==='mushroom'?'米饭和香菇青菜一起焖。想加点料，可以另配一个熟鸡蛋。':r.pair):r.id==='potato'?'这是一盘配菜，配热饭吃。米饭另备。':r.pair,flavorNote:r.key,prerequisites:pre,ingredients,steps:structuredClone(steps[r.id]),time:{totalMinutes:times[r.id][servings-1],activeMinutes:times[r.id][servings+1],basis:'editorial',conditions:[r.id==='mushroom'?'含洗切、煮饭和加热青菜；总时间随电饭煲程序变化。':['tomato','pepper-tofu'].includes(r.id)?'含洗切、炒菜和盛饭，米饭已备好。':r.id==='suantang'?'含洗切和盛碗，使用无需泡发的即煮米线。':'含备菜和盛碗，面条煮制时间以包装为准。']},equipment:gear[r.id].map(id=>({id,name:tools[id],count:id==='bowl'?servings:1})),troubleshooting:r.tips.map(([question,answer])=>({question,answer})),leftovers:['cabbage','radish'].includes(r.id)?'白菜、萝卜只切这一顿要用的量，没切的收好放回冰箱。剩下的干面扎紧袋口。':r.id==='suantang'?'没用完的底料和豆腐按包装说明保存。米线煮好后容易吸汤，吃多少煮多少。':'没下锅的材料收好，按原包装说明保存。调好的酱汁与干面分开放。',flavorOptions:opts,defaultOptionIds:opts.filter(x=>x.id.endsWith('normal')).map(x=>x.id),selectedOptionIds:opts.filter(x=>x.id.endsWith('normal')).map(x=>x.id)};
 }
 catalog.recipes.push({id:recipeId,rev:1,title:r.name,kind:role==='soup'?'soup':role==='side'?'dish':'mixed',sources:['食有数原有编辑菜谱，本次整理为完整一餐做法']});
 catalog.meals.push({id:mealId,rev:1,recipeIds:[recipeId],defaultVariantId:variantId,variantIds:[variantId],aliases:[],tags:[r.group,r.region],editorialRank:r.id==='cabbage'?2:r.id==='sesame'?4:10+catalog.meals.length});
 catalog.variants.push({id:variantId,rev:1,mealId,plans,alternatives:[]});
 meta[mealId]={description:r.desc,story:r.story,region:r.region,group:r.group,color:r.color,art:r.art};legacyMap[r.id]={kind:'public',mealId,variantId,personalId:null};
}
const variant=id=>catalog.variants.find(v=>v.id===id);
// Fully authored missing-egg plan, with its own equipment and timing.
const cabbageClear=structuredClone(variant('cabbage-egg-clear'));cabbageClear.id='cabbage-clear';
for(const p of Object.values(cabbageClear.plans)){
 p.title='白菜汤面';p.ingredients=p.ingredients.filter(i=>i.id!=='egg');p.equipment=p.equipment.filter(i=>i.id!=='egg');p.composition='一碗白菜清汤面，菜帮煮软，菜叶最后放。';p.flavorNote='用白菜的清甜做汤底，最后滴一点香油。';
 p.steps=[step('prepare','prepare','白菜帮和叶分开放','白菜洗净，菜帮切细，菜叶切小块，分开放。',['cabbage']),step('boil','cook','先煮菜帮和面条','锅里加水烧开，放菜帮和挂面，按面条包装说明煮。',['water','cabbage','noodle'],240,['面条松散开，菜帮开始变软。']),step('greens','cook','菜叶最后放','面条快熟时放菜叶，再煮一会儿。',['cabbage'],60,['面条没有硬芯，白菜帮能夹断，菜叶熟软。']),step('season','finish','调味盛碗','加盐和香油，搅匀尝味后盛出。',['salt','oil'])];p.time.totalMinutes=p.servings===1?[12,20]:[15,25];p.time.activeMinutes=p.servings===1?[6,10]:[8,12];p.troubleshooting=[{question:'汤面有点咸？',answer:'加一点热水，重新煮开后再尝。面已经够软，就先捞到碗里，单独调整汤。'}];
}
catalog.variants.push(cabbageClear);catalog.meals.find(m=>m.id==='meal-cabbage').variantIds.push('cabbage-clear');
function addMeal(id,recipeId,variantId,name,plans,display,rank){catalog.meals.push({id,rev:1,recipeIds:[recipeId],defaultVariantId:variantId,variantIds:[variantId],aliases:[],tags:[display.group,display.region],editorialRank:rank});catalog.variants.push({id:variantId,rev:1,mealId:id,plans,alternatives:[]});meta[id]=display;}
const eggPlans=structuredClone(variant('cabbage-egg-clear').plans);
for(const p of Object.values(eggPlans)){
 p.title='鸡蛋清汤面';p.ingredients=p.ingredients.filter(i=>i.id!=='cabbage');p.equipment=p.equipment.filter(i=>i.id!=='board');p.composition='面条和鸡蛋在一口锅里煮，不用切菜。';p.flavorNote='清汤、蛋花和一点香油，想快点吃饭时很省事。';p.steps=[step('prepare','prepare','把蛋打散','鸡蛋打入小碗，用筷子搅散。挂面和调料放到手边。',['egg','noodle']),step('boil','cook','水开后下面条','锅里加水烧开，下挂面，用筷子轻轻拨散，按包装说明煮。',['water','noodle'],240,['尝一根面，快没有硬芯时就可以淋蛋液。']),step('egg','cook','淋入蛋液','沿锅边缓缓淋入蛋液，等蛋液凝固后轻轻推开，继续煮至熟透。',['egg'],120,['蛋液完全凝固，面条没有硬芯。']),step('season','finish','加盐和香油','加盐和香油，搅匀后尝味，盛到碗里。',['salt','oil'])];p.time={totalMinutes:p.servings===1?[12,18]:[15,22],activeMinutes:p.servings===1?[5,8]:[6,10],basis:'editorial',conditions:['含烧水和盛碗；按面条包装调整煮制时间。']};p.troubleshooting=[{question:'蛋花怎么淋得完整一些？',answer:'让汤保持微沸，慢慢淋入蛋液。先等它凝固，再用筷子轻轻推开。'}];p.leftovers='干面用多少取多少，剩下的扎紧袋口。鸡蛋放回原来的存放处。';
}
catalog.recipes.push({id:'recipe-egg-noodle',rev:1,title:'鸡蛋清汤面',kind:'mixed',sources:['食有数一锅面编辑做法']});addMeal('meal-egg-noodle','recipe-egg-noodle','egg-clear-noodle','鸡蛋清汤面',eggPlans,{description:'不用切菜，水开后下面，最后淋入蛋液。',story:'家里有鸡蛋和挂面时，清汤面是很容易想到的一顿。想加一点青菜，也可以看看白菜鸡蛋汤面。',region:'一锅做完',group:'日常饭',color:'gold',art:'soup'},0);
const tomatoPlans=structuredClone(variant('cabbage-egg-clear').plans);
for(const p of Object.values(tomatoPlans)){
 p.title='番茄鸡蛋汤面';const ing=p.ingredients.find(i=>i.id==='cabbage');Object.assign(ing,{id:'tomato',name:'番茄',amount:p.servings===1?200:380,householdText:p.servings===1?'约1个大番茄':'约2个大番茄',purchaseNote:buy.tomato});p.ingredients.find(i=>i.id==='oil').name='食用油';p.ingredients.find(i=>i.id==='oil').amount=p.servings===1?5:8;p.composition='番茄、鸡蛋和面条一起煮，有汤有主食。';p.flavorNote='番茄先炒软，汤会更有味道。';p.steps=[step('prepare','prepare','番茄切块，鸡蛋打散','番茄洗净切小块，鸡蛋打散。',['tomato','egg']),step('tomato','cook','炒出番茄汁','锅里放油，中火炒番茄。炒软后加水煮开。',['oil','tomato','water'],240,['番茄边缘变软，锅底有汤汁。']),step('noodles','cook','下面条','放入挂面，拨散后按包装说明煮。',['noodle'],240,['面条快没有硬芯时，准备淋蛋液。']),step('egg','cook','淋蛋液，煮到凝固','缓缓淋入蛋液，等凝固后轻轻推开，继续煮到熟透。',['egg'],120,['蛋液完全凝固，面条软硬合适。']),step('season','finish','尝味盛出','加入盐，搅匀尝味后盛出。',['salt'])];p.time.totalMinutes=p.servings===1?[18,25]:[22,30];p.time.activeMinutes=p.servings===1?[10,15]:[12,18];p.troubleshooting=[{question:'番茄炒不出汁？',answer:'切小一点，盖上锅盖焖一会儿。锅底干了就沿边加少量水。'},{question:'面已经软了，汤还是偏咸？',answer:'先把面捞到碗里，再往锅中加热水调整汤的咸淡。'}];p.leftovers='番茄按个取，切开后剩下的包好冷藏，尽早用掉。干面留在原包装里。';
}
addMeal('meal-tomato-noodle','recipe-tomato-egg','tomato-egg-noodle','番茄鸡蛋汤面',tomatoPlans,{description:'多切一个番茄，炒出汁再煮面，汤里带一点酸甜。',story:'没有现成米饭的时候，把番茄和鸡蛋煮进一碗面里，也是一顿热乎的晚饭。',region:'家常做法',group:'日常饭',color:'red',art:'noodle'},1);
function alt(from,id,reason,to,explanation){const target=variant(to);variant(from).alternatives.push({id,reason,targetMealId:target.mealId,targetVariantId:to,explanation});}
alt('cabbage-egg-clear','no-egg','没有鸡蛋','cabbage-clear','可以煮白菜汤面。还需要挂面、盐和香油，少一个打蛋碗。');
alt('cabbage-clear','with-egg','想加个鸡蛋','cabbage-egg-clear','打散一个鸡蛋，面快熟时淋进汤里；看看带蛋花的做法。');
alt('tomato-egg-rice','no-rice','没备米饭','tomato-egg-noodle','家里有挂面的话，可以煮番茄鸡蛋汤面。需要面条和更多水，做法也换成一锅煮。');
alt('suantang-tofu','no-base','没有酸汤底料','cabbage-clear','换一碗清汤面也可以。这份需要白菜和挂面，汤味清淡，跟酸汤米线是两种吃法。');
alt('pepper-tofu-rice','no-rice','没备米饭','egg-clear-noodle','家里有鸡蛋和挂面的话，可以先做一碗清汤面。豆腐留到下一顿用。');
alt('egg-clear-noodle','with-cabbage','想加点白菜','cabbage-egg-clear','加两三片白菜，菜帮先煮、菜叶后放，需要用到刀和砧板。');
const articles=old.window.SYS_ARTICLES.map(a=>({...a,recipes:a.recipes.map(id=>ids[id][1])}));
for(const v of catalog.variants)for(const p of Object.values(v.plans)){
 const mealsCopy={
  'suantang-tofu':'酸汤里煮米线、豆腐和青菜，一口锅就是一顿。',
  'tomato-egg-rice':'番茄炒出汁，和鸡蛋一起浇在热饭上，汤汁留多一点更好拌。',
  'scallion-oil-noodle':'先煮面，再用同一口锅煎葱油，拌好就是一碗香喷喷的面。',
  'sesame-noodle':'芝麻酱用温水调开，拌上热面和黄瓜丝。',
  'cabbage-egg-clear':'白菜帮先煮，菜叶后放，最后淋入蛋液，一碗面就有菜有蛋。',
  'mushroom-greens-rice':'香菇和米一起焖，饭熟后加入青菜再加热。想多吃点，可以另配一个熟鸡蛋。',
  'pumpkin-millet-porridge':'南瓜和小米慢慢煮软，想当一顿吃，可以再配鸡蛋和一份蔬菜。',
  'radish-tofu-soup':'萝卜煮到清甜，再放豆腐，配饭或馒头吃。主食另外备一份。',
  'lotus-mushroom-soup':'莲藕和香菇煮一锅清汤，配饭吃时可以再加个熟鸡蛋。',
  'seaweed-egg-soup':'给盖饭或拌面加一碗热汤，水开后放紫菜、淋蛋液，很快就好。',
  'pepper-tofu-rice':'豆腐煎到微黄，和青椒一起烧，留一点汤汁浇到热米饭上。'
 };
 if(mealsCopy[v.id])p.composition=mealsCopy[v.id];
 if(v.mealId==='meal-cabbage')p.leftovers='白菜只切这一顿要用的量，剩下的收好放回冰箱。干面留在原包装里，扎紧袋口。';
 if(v.mealId==='soup-radish-tofu')p.leftovers='萝卜只切这一顿要用的量，剩下的包好冷藏。豆腐开封后按包装说明保存，尽早用掉。';
 if(!p.ingredients.some(i=>i.id==='noodle')&&!p.prerequisites.length)p.time.conditions=['含洗切、烹煮和盛碗；切块大小会影响时间。'];
 if(v.id==='potato-sour-spicy')p.flavorNote='土豆丝冲洗后沥干再炒。醋分两次加，出锅时保留一点清爽的酸味。';
 if(p.mealRole==='soup'&&v.mealId!=='soup-radish-tofu')p.leftovers='只切这一顿要用的原料。没下锅的包好收起，已煮好的汤粥与生食材分开放。';
 if(v.id==='mushroom-greens-rice')p.leftovers='鲜香菇和青菜取够这顿的量，剩下的分别收好。米饭煮好后及时吃。';
 if(v.id==='potato-sour-spicy')p.leftovers='土豆现切现炒口感更好。没用到的整颗土豆放在阴凉通风处。';
 if(v.id==='tomato-egg-rice'||v.id==='pepper-tofu-rice')p.leftovers='米饭和炒菜按这顿的食量盛。没下锅的原料包好收起，与熟菜分开放。';
}
articles[0].paragraphs[2][1]='喜欢这次的味道，就点“下次按这个做”。下回打开，盐和其他调味还是这次的用量。也可以写一句自己的提醒，比如“番茄再炒软一点”。';
articles[1].intro='南瓜煮粥，萝卜和莲藕煮汤。晚饭想多一碗热的，可以从这些做法里挑。';
const bundle={catalog,meta,articles,legacyMap};
fs.writeFileSync(path.join(__dirname,'../src/content.js'),'window.SYS_CONTENT = '+JSON.stringify(bundle,null,2)+';\n');
console.log(`Content built: ${catalog.meals.length} entries, ${catalog.variants.length} variants, ${articles.length} reads.`);
