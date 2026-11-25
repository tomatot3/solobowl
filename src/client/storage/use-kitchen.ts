"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import type {KitchenCommand} from "../../domain/tasks/commands";
import type {KitchenWorkspace} from "../../domain/tasks/model";
import {onAccountChange} from "./account-change";
import {changeWorkspace,kitchenScope,readWorkspace,type KitchenScope} from "./tasks";

export function useKitchen(){
  const [scope,setScope]=useState<KitchenScope|null>(null);
  const [workspace,setWorkspace]=useState<KitchenWorkspace|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const active=useRef(false);
  const pending=useRef<{signature:string;id:string}|null>(null);
  const reload=useCallback(async ()=>{
    try{
      const current=await kitchenScope();
      const data=await readWorkspace(current);
      if(active.current){setScope(current);setWorkspace(data);setError("");}
    }catch(error){if(active.current)setError(error instanceof Error?error.message:"暂时无法读取记录。");}
  },[]);
  useEffect(()=>{
    active.current=true;
    const initialize=setTimeout(()=>void reload(),0);
    const stop=onAccountChange(()=>location.reload());
    return ()=>{active.current=false;clearTimeout(initialize);stop();};
  },[reload]);
  async function change(command:KitchenCommand){
    if(!scope||busy)return null;
    const signature=JSON.stringify(command);
    const operation=pending.current?.signature===signature?pending.current.id:crypto.randomUUID();
    pending.current={signature,id:operation};
    setBusy(true);setError("");
    try{
      const result=await changeWorkspace(scope,command,undefined,operation);
      if(active.current)setWorkspace(result.workspace);
      pending.current=null;
      return result;
    }catch(error){if(active.current)setError(error instanceof Error?error.message:"操作未完成。");return null;}
    finally{if(active.current)setBusy(false);}
  }
  return {scope,workspace,error,busy,reload,change};
}
