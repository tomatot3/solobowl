import {activeTask,getServing,type CookingTask,type Feedback} from "../tasks/model";
import type {EntityId} from "../shared/types";
export type TaskAction="start"|"resume"|"next"|"previous"|"timer"|"complete"|"cancel";
export function timerRemaining(task:CookingTask,now:number){
  return task.timer?Math.max(0,Math.ceil((task.timer.deadline-now)/1000)):null;
}
export function stepDuration(task:CookingTask){
  const step=task.snapshot.steps[task.step];
  if(!step)return null;
  const override=getServing(task).stepOverrides.find(value=>value.stepId===step.id);
  return override?override.durationSeconds:step.durationSeconds;
}
export function requiresAvailability(action:TaskAction){
  return action!=="cancel";
}
export function changeServing(task:CookingTask,option:EntityId,revision:number):CookingTask{
  if(!activeTask(task)||task.revision!==revision)throw new Error("REVISION_CONFLICT");
  if(task.servingOptionId===option)return task;
  const next={...task,servingOptionId:option,servingRevision:task.servingRevision+1,revision:task.revision+1};
  getServing(next);
  return next;
}
export function applyTaskAction(task:CookingTask,action:TaskAction,revision:number,now:Date):CookingTask{
  if(action==="complete"&&task.state==="completed")return task;
  if(!activeTask(task)||task.revision!==revision)throw new Error("REVISION_CONFLICT");
  const next={...task,revision:task.revision+1,checkedAt:action==="cancel"?task.checkedAt:now.toISOString()};
  if(action==="cancel")return {...next,state:"cancelled",timer:null};
  if(action==="start"&&task.state==="todo")return {...next,state:"cooking"};
  if(task.state!=="cooking")throw new Error("REVISION_CONFLICT");
  if(action==="resume")return next;
  if(action==="next"&&task.step<task.snapshot.steps.length-1)return {...next,step:task.step+1,timer:null};
  if(action==="previous"&&task.step>0)return {...next,step:task.step-1,timer:null};
  if(action==="complete"&&task.step===task.snapshot.steps.length-1)return {...next,state:"completed",timer:null,completedAt:now.toISOString(),
    completionServing:{optionId:task.servingOptionId,revision:task.servingRevision}};
  if(action==="timer"){
    if(task.timer?.step===task.step)return task;
    const duration=stepDuration(task);
    if(duration===null||duration<=0)throw new Error("INVALID_INPUT");
    const startedAt=now.getTime();
    return {...next,timer:{step:task.step,startedAt,deadline:startedAt+duration*1000}};
  }
  throw new Error("REVISION_CONFLICT");
}
export function applyFeedback(task:CookingTask,feedback:Feedback,revision:number){
  if(task.state!=="completed"||task.revision!==revision)throw new Error("REVISION_CONFLICT");
  return {...task,feedback,revision:revision+1};
}
