import {expect,test} from "@playwright/test";

test("offers local merge after login and sends records only when explicitly confirmed",async({page})=>{
  await page.route("**/api/v1/profile",route=>route.fulfill({status:401,json:{error:{code:"AUTH_REQUIRED"}}}));
  await page.goto("/account/profile");
  const prefs=page.locator("#preferences");
  await prefs.getByLabel("希望总耗时（分钟）").fill("25");
  await prefs.getByRole("checkbox").check();
  await prefs.getByRole("button",{name:"保存",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("档案已更新");
  await page.route("**/api/v1/auth/session",route=>route.fulfill({json:{data:{userId:"a-test-account"}}}));
  const uploads:unknown[]=[];
  await page.route("**/api/v1/merges",route=>{
    if(route.request().method()==="GET")return route.fulfill({json:{data:null}});
    uploads.push(route.request().postDataJSON());
    return route.fulfill({json:{data:{id:"fixture",status:"completed",revision:1,applied:["preferences"],conflicts:[]}}});
  });
  await page.goto("/account/merge");
  await expect(page.getByText("当前浏览器有游客档案")).toBeVisible();
  await page.getByRole("link",{name:"暂不合并"}).click();
  await expect(page).toHaveURL(/\/account$/);
  expect(uploads).toHaveLength(0);
  await page.getByRole("link",{name:"合并游客档案"}).click();
  await page.getByRole("button",{name:"确认合并并授权"}).click();
  await expect(page.getByText("本次合并已完成")).toBeVisible();
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toMatchObject({consent:true,records:[{section:"preferences",values:{preferredMinutes:25}}]});
  const cleanup=page.getByRole("button",{name:"清理已合并的游客副本"});
  await expect(cleanup).toBeVisible();
  page.once("dialog",dialog=>dialog.dismiss());
  await cleanup.click();
  await expect(page.getByText(/游客原记录仍在当前浏览器/)).toBeVisible();
  page.once("dialog",dialog=>dialog.accept());
  await cleanup.click();
  await expect(page.getByText(/已清理本机的游客副本/)).toBeVisible();
  await page.goto("/account/profile");
  await expect(prefs.getByLabel("希望总耗时（分钟）")).toHaveValue("");
});

test("recommendation enhancement has its own opt-in and withdrawal",async({page})=>{
  const id="00000000-0000-4000-8000-0000000000ac";
  await page.route("**/api/v1/profile",route=>route.fulfill({json:{data:{accountId:id,sections:{},consents:[]}}}));
  let granted=false;
  let submitted:unknown;
  await page.route("**/api/v1/consents/ai",route=>{
    const request=route.request();
    if(request.method()==="POST"){granted=true;submitted=request.postDataJSON();}
    if(request.method()==="DELETE")granted=false;
    return route.fulfill({json:{data:{noticeVersion:"p0-ai-v1",noticeUrl:"https://example.invalid/ai-notice",granted}}});
  });
  await page.goto("/account/profile");
  const region=page.getByRole("region",{name:"推荐理由增强授权"});
  await expect(region.getByRole("link",{name:"查看处理告知"})).toHaveAttribute("href","https://example.invalid/ai-notice");
  const grant=region.getByRole("button",{name:"授权增强"});
  await expect(grant).toBeDisabled();
  await region.getByRole("checkbox").check();
  await grant.click();
  await expect(region.getByRole("status")).toContainText("已授权");
  expect(submitted).toEqual({accepted:true,noticeVersion:"p0-ai-v1"});
  await region.getByRole("button",{name:"撤回增强授权"}).click();
  await expect(region.getByRole("status")).toContainText("已撤回");
  await expect(grant).toBeDisabled();
  expect(granted).toBe(false);
});

test("logout with unsynced records requires an explicit decision",async({page})=>{
  const id="00000000-0000-4000-8000-0000000000ab";
  await page.route("**/api/v1/auth/session",route=>route.fulfill({json:{data:{userId:id}}}));
  await page.route("**/api/v1/profile",route=>route.fulfill({json:{data:{accountId:id,sections:{},consents:[]}}}));
  await page.route("**/api/v1/consents",route=>route.fulfill({json:{data:{id:crypto.randomUUID()}}}));
  await page.route("**/api/v1/sync/bootstrap",route=>route.fulfill({status:503,json:{error:{message:"测试同步故障"}}}));
  let logouts=0;
  await page.route("**/api/v1/auth/logout",route=>{logouts++;return route.fulfill({status:204});});
  await page.goto("/account/profile");
  const prefs=page.locator("#preferences");
  await prefs.getByLabel("希望总耗时（分钟）").fill("25");
  await prefs.getByRole("checkbox").check();
  await prefs.getByRole("button",{name:"保存",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await page.goto("/account");
  await page.getByRole("button",{name:"退出登录"}).click();
  const choices=page.getByRole("group",{name:"处理未同步改动"});
  await expect(choices).toBeVisible();
  await choices.getByRole("button",{name:"取消"}).click();
  expect(logouts).toBe(0);
  await page.getByRole("button",{name:"退出登录"}).click();
  await choices.getByRole("button",{name:"放弃未同步并退出"}).click();
  await expect.poll(()=>logouts).toBe(1);
});
