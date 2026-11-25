import Dexie,{type Table} from "dexie";
import type {Owner} from "../../domain/shared/types";
import {owner as validateOwner} from "../../domain/shared/validation";
export const LOCAL_STORAGE_NOTICE="游客记录仅保留在当前浏览器，无隐式云备份或跨设备同步；清除站点数据可能丢失。登录后须确认才能合并游客记录。";
type LocalEntity={collection:string;id:string;value:unknown};
export type LocalOperation={operationId:string;collection:string;entityId:string;destination:"local"|"cloud";payload:unknown};
type Meta={key:string;value:unknown};
type Barrier={section:string;generation:number};
export function storageName(scope:Owner):string{
 if(scope.kind!=="account"&&scope.kind!=="guest")throw new Error("INVALID_LOCAL_NAMESPACE");
 const validated=validateOwner(scope.kind,scope.id);return `shiyoushu:v1:${validated.kind}:${validated.id}`;
}
class ScopedDatabase extends Dexie{
 entities!:Table<LocalEntity,[string,string]>;outbox!:Table<LocalOperation,string>;meta!:Table<Meta,string>;barriers!:Table<Barrier,string>;
 constructor(name:string){
  super(name);
  this.version(1).stores({entities:"[collection+id],collection",meta:"key"});
  this.version(2).stores({entities:"[collection+id],collection",meta:"key",outbox:"operationId,[collection+entityId]",barriers:"section"});
 }
}
/** Each owner has a different physical database. No network or background upload.
 * Entity and queue tables cannot share keys; callers cannot supply an owner per write.
 * Future feature repositories must use one Dexie transaction for related writes. */
export class LocalStore{
 private readonly db:ScopedDatabase;private closed=false;readonly scope:Readonly<Owner>;
 constructor(scope:Owner){this.db=new ScopedDatabase(storageName(scope));this.scope=Object.freeze({...scope});}
 private ensureOpen():void{if(this.closed)throw new Error("LOCAL_STORE_CLOSED");}
 async put(collection:string,id:string,value:unknown):Promise<void>{this.ensureOpen();await this.db.entities.put({collection,id,value});}
 async get<T=unknown>(collection:string,id:string):Promise<T|undefined>{this.ensureOpen();return (await this.db.entities.get([collection,id]))?.value as T|undefined;}
 async remove(collection:string,id:string):Promise<void>{this.ensureOpen();await this.db.entities.delete([collection,id]);}
 async snapshot(keys:[string,string][]):Promise<(LocalEntity|undefined)[]>{this.ensureOpen();return this.db.entities.bulkGet(keys);}
 async removeUnchanged(keys:[string,string][],expected:string):Promise<boolean>{
  this.ensureOpen();
  return this.db.transaction("rw",this.db.entities,async()=>{
   if(JSON.stringify(await this.db.entities.bulkGet(keys))!==expected)return false;
   await this.db.entities.bulkDelete(keys);
   return true;
  });
 }
 async update<T>(collection:string,id:string,change:(current:T|undefined)=>T|undefined):Promise<T|undefined>{
  this.ensureOpen();return this.db.transaction("rw",this.db.entities,async()=>{const current=(await this.db.entities.get([collection,id]))?.value as T|undefined;const next=change(current);if(next===undefined)await this.db.entities.delete([collection,id]);else await this.db.entities.put({collection,id,value:next});return next;});
 }
 async enqueue(operation:LocalOperation):Promise<void>{
  this.ensureOpen();if(this.scope.kind==="guest"&&operation.destination!=="local")throw new Error("GUEST_CLOUD_WRITE_FORBIDDEN");
  if(!["local","cloud"].includes(operation.destination))throw new Error("INVALID_LOCAL_DESTINATION");
  // add, not put: retries must not overwrite an existing operation with different data.
  await this.db.outbox.add(operation);
 }
 async pending():Promise<LocalOperation[]>{this.ensureOpen();return this.db.outbox.toArray();}
 async acknowledge(operationId:string):Promise<void>{this.ensureOpen();await this.db.outbox.delete(operationId);}
 async schemaVersion():Promise<number>{this.ensureOpen();await this.db.open();return this.db.verno;}
 close():void{this.closed=true;this.db.close();}
 async destroy():Promise<void>{this.close();await this.db.delete();}
}
