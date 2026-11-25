import {openGuestStore} from "./guest";

export type Favorite={recipeId:string;versionId:string;name:string;state:string;revision?:number;deletionGeneration?:number};
type Scope={kind:"guest"}|{kind:"account";id:string};

export async function favoriteScope():Promise<Scope>{
  const response=await fetch("/api/v1/auth/session",{cache:"no-store"});
  if(response.status===401)return {kind:"guest"};
  if(!response.ok)throw new Error("暂时无法读取账户收藏。");
  return {kind:"account",id:(await response.json()).data.userId};
}

async function remote<T>(scope:Extract<Scope,{kind:"account"}>,route="",method="GET",body?:object):Promise<T>{
  const response=await fetch("/api/v1/favorites"+route,{
    method,cache:"no-store",headers:{"x-profile-account":scope.id,...(body?{"content-type":"application/json"}:{})},
    body:body?JSON.stringify(body):undefined,
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result.error?.message??"收藏操作未完成。");
  return result.data;
}

export async function readFavorites(scope:Scope):Promise<Favorite[]>{
  if(scope.kind==="account")return remote(scope);
  if(!localStorage.getItem("shiyoushu:guest-id"))return [];
  const store=openGuestStore();
  try{return (await store.get<Favorite[]>("favorites","list"))??[];}
  finally{store.close();}
}

export async function changeFavorite(scope:Scope,item:Favorite,saved:boolean){
  if(scope.kind==="account"){
    await remote(scope,"/"+encodeURIComponent(item.recipeId),saved?"PUT":"DELETE",
      saved?{versionId:item.versionId}:{baseRevision:item.revision,deletionGeneration:item.deletionGeneration});
    return readFavorites(scope);
  }
  const store=openGuestStore();
  try{
    return (await store.update<Favorite[]>("favorites","list",old=>{
      const list=(old??[]).filter(record=>record.recipeId!==item.recipeId);
      if(saved)list.unshift(item);
      return list;
    }))??[];
  }finally{store.close();}
}
