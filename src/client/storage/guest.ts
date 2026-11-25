import {owner} from "../../domain/shared/validation";
import {LocalStore} from "./database";
const key="shiyoushu:guest-id";
export function openGuestStore():LocalStore{
 let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return new LocalStore(owner("guest",id));
}
