import {test,expect} from "@playwright/test";
import { createIndependentDevices } from "../support/browser-contexts";
test("guest onboarding and browser contexts are isolated",async({browser})=>{
  const pair=await createIndependentDevices(browser);
  try {
    const page=await pair.first.newPage();await page.goto("/");
    await expect(page.getByRole("heading",{level:1})).toContainText("从一餐开始");
    await expect(page.getByRole("button",{name:"先逛逛，跳过设置"})).toBeVisible();
    await page.evaluate(()=>localStorage.setItem("setup-probe","first-device"));
    const other=await pair.second.newPage();await other.goto("/");
    expect(await other.evaluate(()=>localStorage.getItem("setup-probe"))).toBeNull();
  } finally {await pair.close();}
});
