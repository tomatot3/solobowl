import {z} from "zod";
import {entityId} from "../shared/validation";
import {applyFeedback,applyTaskAction,changeServing} from "../cooking/progress";
import {shoppingRows} from "../shopping/aggregate";
import {activeTask,type KitchenWorkspace} from "./model";

const id=z.uuid();
const revision=z.number().int().min(0).max(2147483646);
export const kitchenCommand=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("create"),recipeId:id,versionId:id,optionId:id}).strict(),
  z.object({kind:z.literal("task"),id,revision,action:z.enum(["start","resume","next","previous","timer","complete","cancel"]),
    stepId:id.optional(),durationSeconds:z.number().int().positive().optional()}).strict(),
  z.object({kind:z.literal("serving"),id,revision,optionId:id}).strict(),
  z.object({kind:z.literal("feedback"),id,revision,feedback:z.object({taste:z.enum(["liked","neutral","disliked"]),portion:z.enum(["small","right","large"])}).strict()}).strict(),
  z.object({kind:z.literal("select"),revision,selected:z.array(id).max(100)}).strict(),
  z.object({kind:z.literal("edit"),revision,rowId:z.string().min(1).max(600),quantity:z.string().regex(/^\d{1,8}(?:\.\d{1,4})?$/).nullable().optional(),purchased:z.boolean().optional()}).strict(),
]);
export type KitchenCommand=z.infer<typeof kitchenCommand>;
export function updateWorkspace(workspace:KitchenWorkspace,input:Exclude<KitchenCommand,{kind:"create"}>,now:Date):KitchenWorkspace{
  if(input.kind==="select"||input.kind==="edit"){
    if(workspace.shopping.revision!==input.revision)throw new Error("REVISION_CONFLICT");
    const shopping={...workspace.shopping,revision:workspace.shopping.revision+1};
    if(input.kind==="select"){
      if(input.selected.some(id=>!workspace.tasks.some(task=>task.id===id&&activeTask(task))))throw new Error("INVALID_INPUT");
      shopping.selected=[...new Set(input.selected)];
    }else{
      const row=shoppingRows(workspace).find(item=>item.id===input.rowId);
      if(!row)throw new Error("RESOURCE_NOT_FOUND");
      const old=shopping.edits[row.id];
      shopping.edits={...shopping.edits,[row.id]:{basis:row.basis,quantity:input.quantity===null?undefined:input.quantity??old?.quantity,purchased:input.purchased??row.purchased}};
    }
    return {...workspace,shopping};
  }
  const existing=workspace.tasks.find(task=>task.id===input.id);
  if(!existing)throw new Error("RESOURCE_NOT_FOUND");
  const next=input.kind==="serving"?changeServing(existing,entityId(input.optionId),input.revision)
    :input.kind==="task"?applyTaskAction(existing,input.action,input.revision,now)
    :applyFeedback(existing,input.feedback,input.revision);
  if(existing===next)return workspace;
  const selected=workspace.shopping.selected.includes(next.id);
  const changedShopping=selected&&(existing.servingRevision!==next.servingRevision||!activeTask(next));
  const shopping=changedShopping?{...workspace.shopping,revision:workspace.shopping.revision+1,
    selected:activeTask(next)?workspace.shopping.selected:workspace.shopping.selected.filter(id=>id!==next.id)}:workspace.shopping;
  return {tasks:workspace.tasks.map(task=>task.id===next.id?next:task),shopping};
}
