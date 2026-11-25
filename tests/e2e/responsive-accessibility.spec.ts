import {expect,test} from "@playwright/test";

test("primary navigation is usable on the device and the store is informational",async({page,hasTouch})=>{
  await page.goto("/kitchen");
  const navigation=page.getByRole("navigation",{name:"主导航"});
  const tabs=navigation.getByRole("link");
  await expect(tabs).toHaveText(["厨房","菜谱","做饭"]);
  if(hasTouch){
    await tabs.nth(2).tap();
  }else{
    await tabs.first().focus();
    const nextLink=page.context().browser()?.browserType().name()==="webkit"?"Alt+Tab":"Tab";
    await page.keyboard.press(nextLink);
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveCSS("outline-style","solid");
    await page.keyboard.press(nextLink);
    await expect(tabs.nth(2)).toBeFocused();
    await page.keyboard.press("Enter");
  }
  await expect(page).toHaveURL(/\/cooking$/);
  await expect(navigation.getByRole("link",{name:"做饭"})).toHaveAttribute("aria-current","page");

  await page.goto("/shopping");
  await page.getByRole("link",{name:"食养好物"}).click();
  await expect(page.getByRole("heading",{name:"食材与器具介绍"})).toBeVisible();
  await expect(page.getByRole("button",{name:/下单|支付/})).toHaveCount(0);
  await expect(page.locator("main a[href^='http']")).toHaveCount(0);
  await page.getByRole("link",{name:"返回厨房"}).click();
  await expect(page).toHaveURL(/\/kitchen$/);
  await page.getByRole("link",{name:"食养好物"}).click();
  await expect(page).toHaveURL(/\/goods$/);
  await expect(page.getByRole("heading",{name:"食材与器具介绍"})).toBeVisible();
});
