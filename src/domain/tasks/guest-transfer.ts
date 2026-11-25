import {z} from "zod";
import type {KitchenWorkspace} from "./model";

const uuid=z.uuid();
const date=z.iso.datetime();
export const guestTask=z.object({
  sourceId:uuid,recipeId:uuid,versionId:uuid,contentHash:z.string().regex(/^[a-f0-9]{64}$/i),
  optionId:uuid,servingRevision:z.number().int().min(1).max(2147483646),step:z.number().int().nonnegative(),
  state:z.enum(["todo","cooking","completed"]),createdAt:date,completedAt:date.nullable(),
  timer:z.object({step:z.number().int().nonnegative(),startedAt:z.number().int().nonnegative(),deadline:z.number().int().nonnegative()}).strict().nullable(),
  feedback:z.object({taste:z.enum(["liked","neutral","disliked"]),portion:z.enum(["small","right","large"])}).strict().nullable(),
}).strict();
export type GuestTask=z.infer<typeof guestTask>;
export const cookingTransfer=z.object({
  tasks:z.array(guestTask).max(30),
  selected:z.array(uuid).max(30),
  edits:z.record(z.string().max(600),z.object({quantity:z.string().regex(/^\d{1,8}(?:\.\d{1,4})?$/).optional(),purchased:z.boolean().optional(),basis:z.string().max(20000)}).strict()),
}).strict().refine(value=>Object.keys(value.edits).length<=100&&new Set(value.tasks.map(task=>task.sourceId)).size===value.tasks.length
  &&value.selected.every(id=>value.tasks.some(task=>task.sourceId===id)));
export type CookingTransfer=z.infer<typeof cookingTransfer>;

export function guestCookingTransfer(workspace:KitchenWorkspace):CookingTransfer{
  const tasks=workspace.tasks.filter(task=>task.state!=="cancelled").slice(0,30).map(task=>guestTask.parse({
    sourceId:task.id,recipeId:task.snapshot.recipeId,versionId:task.snapshot.id,contentHash:task.snapshot.contentHash,
    optionId:task.servingOptionId,servingRevision:task.servingRevision,step:task.step,state:task.state,
    timer:task.timer,createdAt:task.createdAt,completedAt:task.completedAt,feedback:task.feedback,
  }));
  return {tasks,selected:workspace.shopping.selected.filter(id=>tasks.some(task=>task.sourceId===id)),
    edits:Object.fromEntries(Object.entries(workspace.shopping.edits).slice(0,100))};
}
