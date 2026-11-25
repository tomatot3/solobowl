import {test,expect,type APIRequestContext} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {join} from "node:path";
import {NOTICE_VERSION} from "../../src/domain/profile/sections";

const demo=process.env.SHIYOUSHU_E2E_DEMO_URL;
test.skip(!demo,"Requires the isolated real database demo.");
async function register(request:APIRequestContext,origin:string){
  const email=randomUUID()+"@example.invalid";
  const password="example test password only";
  const create=await request.post(origin+"/api/v1/auth/register",{headers:{origin},data:{email,password}});
  expect(create.status()).toBe(202);
  let link:string|undefined;
  for(const file of await readdir(".cache/auth-mail")){
    const message=JSON.parse(await readFile(join(".cache/auth-mail",file),"utf8"));
    if(message.kind==="verify"&&message.to===email){link=message.link;break;}
  }
  expect(Boolean(link)).toBe(true);
  return {email,password,link:link!};
}

test("real demo goes from recommendation through account cooking and a second browser",async({page,browser,isMobile})=>{
  test.setTimeout(210000);
  const origin=new URL(demo!).origin;
  expect(origin).toBe("http://localhost:3001");
  // File-watcher reloads are unrelated to this browser and API contract test.
  await page.context().routeWebSocket(/\/_next\/webpack-hmr(?:\?|$)/,()=>{});
  const {email,password,link}=await register(page.request,origin);
  if(isMobile){
    const token=new URLSearchParams(new URL(link).hash.slice(1)).get("token");
    expect((await page.request.post(origin+"/api/v1/auth/verification/confirm",{headers:{origin},data:{token}})).status()).toBe(200);
    expect((await page.request.post(origin+"/api/v1/auth/login",{headers:{origin},data:{email,password}})).status()).toBe(200);
    await page.goto(origin+"/account/merge",{waitUntil:"domcontentloaded"});
  }else{
    await page.goto(link,{waitUntil:"domcontentloaded"});
    await page.getByRole("button",{name:"确认验证"}).click();
    await expect(page.getByText("邮箱已验证，可以登录。")).toBeVisible();
    await page.getByRole("link",{name:"去登录"}).click();
    await expect(page).toHaveURL(origin+"/account/login");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码",{exact:true}).fill(password);
    await page.getByRole("button",{name:"登录",exact:true}).click();
    await expect(page).toHaveURL(/\/account\/merge$/);
  }
  await expect(page.getByRole("heading",{name:"合并游客档案"})).toBeVisible();
  await page.getByRole("link",{name:"返回个人中心"}).click();
  await expect(page).toHaveURL(origin+"/account");
  const consent=await page.request.post(origin+"/api/v1/consents",{headers:{origin},data:{purpose:"preferences",accepted:true,noticeVersion:NOTICE_VERSION}});
  expect(consent.status()).toBe(201);
  const saved=await page.request.patch(origin+"/api/v1/profile/preferences",{headers:{origin},data:{
    values:{preferredMinutes:25},baseRevision:0,deletionGeneration:0,consentRef:(await consent.json()).data.id,
  }});
  expect(saved.status()).toBe(200);
  const stale=await page.request.put(origin+"/api/v1/today-state",{headers:{origin},data:{businessDate:"2000-01-01",text:"Synthetic expired note",baseRevision:0}});
  expect(stale.status()).toBe(422);
  expect((await stale.json()).error.code).toBe("EXPIRED_STATE");
  await page.goto(origin+"/account",{waitUntil:"domcontentloaded"});
  await page.getByRole("link",{name:"返回厨房"}).click();
  const primary=page.getByRole("region",{name:"时令推荐"}).getByRole("article").first();
  await expect(primary).toBeVisible({timeout:35000});
  const name=await primary.getByRole("heading").innerText();
  await primary.getByRole("link").click();
  await page.getByRole("button",{name:"收藏",exact:true}).click();
  await expect(page.getByRole("button",{name:"已收藏",exact:true})).toBeVisible();
  const recipeUrl=new URL(page.url());
  await page.getByRole("button",{name:"加入待做"}).click();
  await expect(page).toHaveURL(/\/cooking\/[a-f0-9-]+$/);
  const cookingUrl=page.url();
  const taskId=new URL(cookingUrl).pathname.split("/").at(-1);
  await page.getByRole("link",{name:"为这道菜列采购清单"}).click();
  await page.getByRole("button",{name:"生成采购清单"}).click();
  await expect(page.getByRole("heading",{name:"需要准备的食材"})).toBeVisible();
  const second=await browser.newContext();
  try{
    await second.routeWebSocket(/\/_next\/webpack-hmr(?:\?|$)/,()=>{});
    const login=await second.request.post(origin+"/api/v1/auth/login",{headers:{origin},data:{email,password}});
    expect(login.status()).toBe(200);
    const syncedList=await second.request.get(origin+"/api/v1/shopping-lists/current");
    expect(syncedList.status()).toBe(200);
    expect((await syncedList.json()).data.selected).toEqual([taskId]);
    const profile=await second.request.get(origin+"/api/v1/profile");
    expect(profile.status()).toBe(200);
    expect((await profile.json()).data.sections.preferences.values.preferredMinutes).toBe(25);
    const favorites=await second.request.get(origin+"/api/v1/favorites");
    expect(favorites.status()).toBe(200);
    expect((await favorites.json()).data).toMatchObject([{versionId:recipeUrl.searchParams.get("version")}]);
    const syncedTask=await second.request.get(origin+"/api/v1/tasks/"+taskId);
    expect(syncedTask.status()).toBe(200);
    expect((await syncedTask.json()).data.task).toMatchObject({id:taskId,snapshot:{name}});
    await page.goto(cookingUrl,{waitUntil:"domcontentloaded"});
    await page.getByRole("button",{name:"开始做饭"}).click();
    await expect(page.getByRole("heading",{name:/步骤 1/})).toBeVisible();
    const complete=page.getByRole("button",{name:"确认完成"});
    while(!await complete.isVisible())await page.getByRole("button",{name:"确认，下一步"}).click();
    page.once("dialog",dialog=>dialog.accept());
    await complete.click();
    await expect(page.getByRole("heading",{name:"这一餐做好了"})).toBeVisible();
    await page.getByRole("button",{name:"保存反馈"}).click();
    await expect(page.getByText("反馈已保存。")).toBeVisible();
    const history=await second.request.get(origin+"/api/v1/history");
    expect(history.status()).toBe(200);
    expect((await history.json()).data.items).toMatchObject([{id:taskId,state:"completed"}]);
    const feedback=await second.request.get(origin+"/api/v1/tasks/"+taskId);
    expect(feedback.status()).toBe(200);
    expect((await feedback.json()).data.task.feedback).toMatchObject({taste:"neutral",portion:"right"});
    if(!isMobile){
      const other=await second.newPage();
      await other.goto(origin+"/cooking/history",{waitUntil:"domcontentloaded"});
      await expect(other.getByRole("heading",{name,exact:true})).toBeVisible({timeout:25000});
      expect(await other.getByRole("heading",{name,exact:true}).count()).toBe(1);
      await other.getByRole("link",{name:"查看记录与反馈"}).click();
      await expect(other.getByText("反馈已保存。")).toBeVisible();
    }
    const sameBrowser=await page.context().newPage();
    await sameBrowser.goto(origin+"/account/profile",{waitUntil:"domcontentloaded"});
    await expect(sameBrowser.getByText("正在编辑当前邮箱账户的档案。")).toBeVisible();
    const logoutPage=await page.context().newPage();
    await logoutPage.goto(origin+"/account",{waitUntil:"domcontentloaded"});
    const logout=logoutPage.waitForResponse(response=>response.url()===origin+"/api/v1/auth/logout");
    await logoutPage.getByRole("button",{name:"退出登录"}).click();
    expect((await logout).status()).toBe(204);
    expect((await page.request.get(origin+"/api/v1/tasks/"+taskId)).status()).toBe(401);
    await sameBrowser.bringToFront();
    await expect(sameBrowser.getByText("正在编辑当前邮箱账户的档案。")).toHaveCount(0);
    await expect.poll(()=>sameBrowser.getByLabel("希望总耗时（分钟）").evaluateAll(inputs=>inputs.some(input=>(input as HTMLInputElement).value==="25"))).toBe(false);
    await sameBrowser.close();
    await logoutPage.close();
    const foreign=await browser.newContext();
    try{
      const outsider=await register(foreign.request,origin);
      const token=new URLSearchParams(new URL(outsider.link).hash.slice(1)).get("token");
      const verify=await foreign.request.post(origin+"/api/v1/auth/verification/confirm",{headers:{origin},data:{token}});
      expect(verify.status()).toBe(200);
      expect((await foreign.request.post(origin+"/api/v1/auth/login",{headers:{origin},data:{email:outsider.email,password:outsider.password}})).status()).toBe(200);
      expect((await foreign.request.get(origin+"/api/v1/tasks/"+taskId)).status()).toBe(404);
      expect((await (await foreign.request.get(origin+"/api/v1/favorites")).json()).data).toEqual([]);
    }finally{await foreign.close();}
  }finally{await second.close();}
});
