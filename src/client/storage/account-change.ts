const key="shiyoushu:account-changed";

export function signalAccountChange(){
  try{localStorage.setItem(key,crypto.randomUUID());}catch{/* Storage may be blocked. */}
  if(typeof BroadcastChannel==="undefined")return;
  const channel=new BroadcastChannel(key);
  channel.postMessage(null);
  channel.close();
}

export function onAccountChange(callback:()=>void){
  function storage(event:StorageEvent){if(event.key===key)callback();}
  window.addEventListener("storage",storage);
  const channel=typeof BroadcastChannel==="undefined"?null:new BroadcastChannel(key);
  channel?.addEventListener("message",callback);
  return ()=>{
    window.removeEventListener("storage",storage);
    channel?.close();
  };
}
