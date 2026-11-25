import { Decimal } from "decimal.js";
import type { EntityId, AccountId, GuestOwnerId, Revision, UTCInstant, Owner, Quantity } from "./types";
const PrecisionDecimal = Decimal.clone({precision:40,rounding:Decimal.ROUND_HALF_UP});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function validatedId(value:string) {if(!uuid.test(value))throw new Error("An immutable random UUID v4 is required");return value;}
export function entityId(value:string):EntityId{return validatedId(value) as EntityId;}
export function accountId(value:string):AccountId{return validatedId(value) as AccountId;}
export function guestOwnerId(value:string):GuestOwnerId{return validatedId(value) as GuestOwnerId;}
export function owner(kind:"account"|"guest",value:string):Owner{return kind==="account"?{kind,id:accountId(value)}:{kind,id:guestOwnerId(value)};}
export function sameOwner(left:Owner,right:Owner):boolean{return left.kind===right.kind&&left.id===right.id;}
export function revision(value:number):Revision {if(!Number.isSafeInteger(value)||value<0)throw new Error("Revision must be a nonnegative safe integer");return value as Revision;}
export function nextRevision(value:Revision):Revision{return revision(value+1);}
export function assertBaseRevision(base:Revision,current:Revision):void{if(base!==current)throw new Error("REVISION_CONFLICT");}
export function utcInstant(value:string):UTCInstant {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))throw new Error("UTC timestamp must use ISO Z format");
 const parsed=new Date(value);if(!Number.isFinite(parsed.getTime())||parsed.toISOString()!==value.replace(/(?<!\.\d{3})Z$/,".000Z"))throw new Error("UTC timestamp is invalid");
 return parsed.toISOString() as UTCInstant;
}
export function quantity(value:string|number|null|undefined):Quantity {
 if(value===null||value===undefined||typeof value==="string"&&value.trim()==="")return null;
 if(typeof value==="string"&&!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim()))throw new Error("Quantity text must be a nonnegative decimal, not an estimate");
 const result=new PrecisionDecimal(typeof value==="string"?value.trim():value);
 if(!result.isFinite()||result.isNegative())throw new Error("Quantity must be finite and nonnegative");return result;
}
export function displayDecimal(value:Decimal):string{return value.toFixed(2);}
