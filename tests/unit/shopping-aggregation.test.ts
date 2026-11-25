import {expect,it} from "vitest";
import {recipeFixture,fixtureId} from "../fixtures/recipes";
import {emptyWorkspace,makeTask} from "../../src/domain/tasks/model";
import {shoppingRows} from "../../src/domain/shopping/aggregate";
import {applyTaskAction,timerRemaining,stepDuration} from "../../src/domain/cooking/progress";

it("merges compatible units while keeping count quantities separate",()=>{
  const f=recipeFixture(1);
  const make=(source:number,quantity:string,unit:string)=>{
    const s=recipeFixture(source);
    const option=s.version.servingOptions[0]!;
    return makeTask(fixtureId(9900+source),{...s.version,servingOptions:[{...option,ingredientQuantities:[{...option.ingredientQuantities[0]!,quantity,unit}]}]},
      option.id,"2026-11-24T00:00:00.000Z");
  };
  const tasks=[make(1,"100","克"),make(2,"0.2","千克"),make(3,"2","个")];
  expect(shoppingRows({tasks,shopping:{...emptyWorkspace().shopping,selected:[...tasks.map(task=>task.id),tasks[0]!.id]}})
    .map(row=>[row.unit,row.quantity])).toEqual([["克","300"],["个","2"]]);
  expect(f.version.steps[0]?.durationSeconds).toBeNull();
});

it("restores a ten-minute absolute timer without advancing after expiry",()=>{
  const f=recipeFixture(1);
  const snapshot={...f.version,steps:[{...f.version.steps[0]!,durationSeconds:600}]};
  const start=new Date("2026-11-24T00:00:00Z");
  const task=makeTask(fixtureId(9991),snapshot,snapshot.servingOptions[0]!.id,start.toISOString());
  const ready=applyTaskAction(task,"start",1,start);
  const timed=applyTaskAction(ready,"timer",2,start);
  expect(timerRemaining(timed,start.getTime()+180000)).toBe(420);
  expect(timerRemaining(timed,start.getTime()+601000)).toBe(0);
  expect(timed.step).toBe(0);
  expect(timed.state).toBe("cooking");
  expect(applyTaskAction(timed,"timer",timed.revision,new Date(start.getTime()+300000))).toBe(timed);
  expect(stepDuration({...ready,snapshot:f.version})).toBeNull();
});
