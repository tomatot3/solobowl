import type { Browser } from "@playwright/test";
export async function createIndependentDevices(browser: Browser) {
  const first=await browser.newContext();
  const second=await browser.newContext();
  return {first,second,close:async()=>{await first.close();await second.close();}};
}
