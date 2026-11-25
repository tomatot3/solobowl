"use client";

import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {onAccountChange} from "@/client/storage/account-change";
import {changeFavorite,favoriteScope,readFavorites,type Favorite} from "@/client/storage/favorites";

type Context={items:Favorite[]|null;error:string;kind:"guest"|"account"|null;change:(item:Favorite,saved:boolean)=>Promise<void>};
const FavoritesContext=createContext<Context|null>(null);

export function FavoritesProvider({children}:{children:ReactNode}){
  const [items,setItems]=useState<Favorite[]|null>(null);
  const [error,setError]=useState("");
  const [scope,setScope]=useState<Awaited<ReturnType<typeof favoriteScope>>|null>(null);
  useEffect(()=>{
    let active=true;
    async function load(){
      const owner=await favoriteScope();
      const records=await readFavorites(owner);
      if(active){setScope(owner);setItems(records);}
    }
    const stop=onAccountChange(()=>location.reload());
    void load().catch(err=>{if(active)setError(err.message??"暂时无法读取收藏。");});
    return ()=>{active=false;stop();};
  },[]);
  async function change(item:Favorite,saved:boolean){
    if(!scope)throw new Error("收藏暂不可用。");
    setItems(await changeFavorite(scope,item,saved));
  }
  return <FavoritesContext.Provider value={{items,error,kind:scope?.kind??null,change}}>{children}</FavoritesContext.Provider>;
}
export function useFavorites(){const value=useContext(FavoritesContext);if(!value)throw new Error("FAVORITES_CONTEXT_MISSING");return value;}

export default function FavoriteButton({recipeId,versionId,name}:{recipeId:string;versionId:string;name:string}){
  const {items,error:loadError,change}=useFavorites();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const item=items?.find(record=>record.recipeId===recipeId);
  async function toggle(){
    setBusy(true);setError("");
    try{await change(item??{recipeId,versionId,name,state:"published"},!item);}
    catch(error){setError(error instanceof Error?error.message:"收藏操作未完成。");}
    finally{setBusy(false);}
  }
  return <div>
    <button className="secondary" aria-pressed={Boolean(item)} disabled={busy||!items} onClick={()=>void toggle()}>{item?"已收藏":"收藏"}</button>
    {(error||loadError)&&<p className="note" role="status">{error||loadError}</p>}
  </div>;
}
