import type {RecipeVersion} from "../recipes/types";
import type {EntityId} from "../shared/types";

export type TaskState="todo"|"cooking"|"completed"|"cancelled";
export type TaskTimer={step:number;startedAt:number;deadline:number};
export type Feedback={taste:"liked"|"neutral"|"disliked";portion:"small"|"right"|"large"};
export type CookingTask={
  id:EntityId; snapshot:RecipeVersion; state:TaskState; revision:number;
  servingOptionId:EntityId; servingRevision:number; step:number; timer:TaskTimer|null;
  createdAt:string; checkedAt:string; completedAt:string|null;
  completionServing:{optionId:EntityId;revision:number}|null; feedback:Feedback|null;
};
export type ShoppingEdit={quantity?:string;purchased?:boolean;basis:string};
export type KitchenWorkspace={
  tasks:CookingTask[]; shopping:{selected:string[];edits:Record<string,ShoppingEdit>;revision:number};
};
export const emptyWorkspace=():KitchenWorkspace=>({tasks:[],shopping:{selected:[],edits:{},revision:0}});
export const activeTask=(task:CookingTask)=>task.state==="todo"||task.state==="cooking";
export function getServing(task:CookingTask){
  const option=task.snapshot.servingOptions.find(item=>item.id===task.servingOptionId&&item.reviewRef);
  if(!option)throw new Error("INVALID_INPUT");
  return option;
}
export function makeTask(id:EntityId,snapshot:RecipeVersion,servingOptionId:EntityId,checkedAt:string):CookingTask{
  const item:CookingTask={id,snapshot,state:"todo",revision:1,servingOptionId,servingRevision:1,step:0,timer:null,createdAt:checkedAt,checkedAt,completedAt:null,completionServing:null,feedback:null};
  getServing(item);
  return item;
}
