import {Decimal} from "decimal.js";
import {activeTask,getServing,type KitchenWorkspace} from "../tasks/model";
const units:Record<string,[string,number]>={"克":["克",1],g:["克",1],"千克":["克",1000],kg:["克",1000],"毫升":["毫升",1],ml:["毫升",1],"升":["毫升",1000],l:["毫升",1000]};
type Contribution={taskId:string;lineId:string;appliedServingRevision:number;quantity:string|null;text:string|null};
export type ShoppingRow={id:string;name:string;unit:string|null;contributions:Contribution[];quantity:string|null;quantityText:string|null;purchased:boolean;needsReview:boolean;basis:string;override?:string};

export function shoppingRows(workspace:KitchenWorkspace):ShoppingRow[]{
  const grouped=new Map<string,{name:string;unit:string|null;contributions:Contribution[]}>();
  for(const task of workspace.tasks){
    if(!activeTask(task)||!workspace.shopping.selected.includes(task.id))continue;
    const option=getServing(task);
    for(const line of task.snapshot.ingredients){
      if(!line.shoppingIncluded||line.role==="auxiliary_water")continue;
      const amount=option.ingredientQuantities.find(item=>item.ingredientLineId===line.id);
      if(!amount)continue;
      const original=amount.unit;
      const known=original?Object.hasOwn(units,original.toLowerCase())?units[original.toLowerCase()]:undefined:undefined;
      const unit=amount.quantity===null?null:known?.[0]??original;
      const id=JSON.stringify([line.ingredientId??line.rawName,amount.quantity===null?"text":"number",unit]);
      const group=grouped.get(id)??{name:line.rawName,unit,contributions:[]};
      if(group.contributions.some(item=>item.taskId===task.id&&item.lineId===line.id))continue;
      group.contributions.push({taskId:task.id,lineId:line.id,appliedServingRevision:task.servingRevision,
        quantity:amount.quantity===null?null:new Decimal(amount.quantity).times(known?.[1]??1).toString(),text:amount.quantityText});
      grouped.set(id,group);
    }
  }
  return [...grouped].map(([id,group])=>{
    const basis=JSON.stringify([...group.contributions].sort((a,b)=>(a.taskId+a.lineId).localeCompare(b.taskId+b.lineId)));
    const edit=workspace.shopping.edits[id];
    const quantity=group.contributions[0]?.quantity===null?null:group.contributions.reduce((sum,item)=>sum.plus(item.quantity??0),new Decimal(0)).toString();
    return {id,...group,basis,quantity,quantityText:quantity===null?[...new Set(group.contributions.map(item=>item.text??"用量待确认"))].join("、"):null,
      purchased:Boolean(edit?.purchased)&&edit?.basis===basis,needsReview:Boolean(edit)&&edit?.basis!==basis,override:edit?.quantity};
  });
}
