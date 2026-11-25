import {test,expect} from "@playwright/test";
import {createHash} from "node:crypto";
import {recipeFixture} from "../fixtures/recipes";
const fixture=recipeFixture();
test("first entry can skip without creating profile or consent and reopen stays in kitchen",async({page})=>{
 await page.goto("/");await expect(page).toHaveURL(/\/welcome$/);await page.getByRole("button",{name:"先逛逛，跳过设置"}).click();await expect(page).toHaveURL(/\/kitchen$/);
 expect(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)))).toEqual({"shiyoushu:onboarding":"skipped"});
 await page.goto("/");await expect(page).toHaveURL(/\/kitchen$/);await expect(page.getByRole("navigation",{name:"主导航"})).toBeVisible();
});
test("kitchen and exact version details share the cover and reviewed quantities",async({page},testInfo)=>{
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/uAAAAAASUVORK5CYII=","base64");
 const image="/content/"+createHash("sha256").update(png).digest("hex")+".png";
 await page.route("**"+image,r=>r.fulfill({body:png,contentType:"image/png"}));
 await page.route("**/api/v1/recommendations",r=>r.fulfill({json:{data:{status:"ready",results:[{recipeId:fixture.recipe.id,versionId:fixture.version.id,name:"测试冬季菜",image,totalMinutes:null,role:"primary",score:"97.65",reason:"适合当前节气。"}]}}}));
 await page.route(`**/api/v1/recipes/${fixture.recipe.id}/versions/${fixture.version.id}`,r=>r.fulfill({json:{data:{...fixture,version:{...fixture.version,name:"测试冬季菜",image,totalMinutes:null}}}}));
 const cover=page.getByRole("img",{name:"测试冬季菜的封面"});
 await page.goto("/kitchen");await expect(page.getByText("耗时待确认",{exact:true})).toBeVisible();
 await expect(cover).toHaveAttribute("src",image);
 await expect.poll(()=>cover.evaluate((element:HTMLImageElement)=>element.naturalWidth)).toBe(1);
 await page.screenshot({path:`.cache/us1-${testInfo.project.name}.png`,fullPage:true});await page.getByRole("link",{name:"查看测试冬季菜"}).click();
 await expect(page).toHaveURL(new RegExp(`/recipes/${fixture.recipe.id}\\?version=${fixture.version.id}$`),{timeout:20000});await expect(page.getByRole("heading",{name:"测试冬季菜",level:1,exact:true})).toBeVisible();await expect(page.getByText("100 g",{exact:false}).first()).toBeVisible();await expect(page.getByText("TEST ONLY",{exact:true}).first()).toBeVisible();
 await expect(cover).toHaveAttribute("src",image);
 await expect.poll(()=>cover.evaluate((element:HTMLImageElement)=>element.naturalWidth)).toBe(1);
 expect(await page.evaluate(()=>localStorage.getItem("shiyoushu:onboarding"))).toBeNull();
});
for(const scenario of [{status:"no_candidates",text:"暂时没有符合条件的菜谱"},{status:"scope_closed",text:"当前不在冬季推荐时段"},{status:"failure",text:"节气资料暂不可用"}]){
 test(`distinct ${scenario.status} state`,async({page})=>{
  await page.route("**/api/v1/recommendations",r=>r.fulfill({status:scenario.status==="failure"?503:200,json:scenario.status==="failure"?{error:{message:scenario.text}}:{data:{status:scenario.status,results:[]}}}));
  await page.goto("/kitchen");await expect(page.getByText(scenario.text,{exact:false}).first()).toBeVisible();
 });
}
test("today text saves locally, survives reopening, and can be deleted",async({page})=>{
 await page.goto("/kitchen");await page.getByLabel("今日文字").fill("今天想慢慢吃饭");await page.getByRole("button",{name:"保存今日文字"}).click();await expect(page.getByRole("status").filter({hasText:"已保存在当前浏览器"})).toBeVisible();
 await page.reload();await expect(page.getByLabel("今日文字")).toHaveValue("今天想慢慢吃饭");await page.getByRole("button",{name:"删除今日文字"}).click();await page.reload();await expect(page.getByLabel("今日文字")).toHaveValue("");
});
test("open browser clears yesterday at Beijing midnight",async({page})=>{
 await page.clock.install({time:new Date("2026-12-31T15:59:45Z")});await page.goto("/kitchen");await page.getByLabel("今日文字").fill("只属于昨天的文字");await page.getByRole("button",{name:"保存今日文字"}).click();await expect(page.getByRole("status").filter({hasText:"已保存在当前浏览器"})).toBeVisible();
 await page.clock.runFor(60000);await expect(page.getByLabel("今日文字")).toHaveValue("");await page.reload();await expect(page.getByLabel("今日文字")).toHaveValue("");
});
