import {expect,test} from "@playwright/test";
import {recipeFixture} from "../fixtures/recipes";

test("searches by a visible time limit and reopens a guest favorite",async({page})=>{
  const recipe=recipeFixture(1,"published",{name:"测试用南瓜粥"});
  const item={recipeId:recipe.recipe.id,versionId:recipe.version.id,name:recipe.version.name,totalMinutes:"15",difficulty:"easy"};
  await page.route("**/api/v1/auth/session",route=>route.fulfill({status:401,json:{error:{code:"AUTH_REQUIRED"}}}));
  await page.route("**/api/v1/recipes/query",route=>route.fulfill({json:{data:{items:[item],difficulties:["easy"],nextCursor:null}}}));
  await page.route("**/api/v1/recipes/*/versions/*",route=>route.fulfill({json:{data:recipe}}));
  await page.goto("/recipes");
  await page.getByLabel("耗时上限（分钟）").fill("20");
  const sent=page.waitForRequest(request=>request.url().endsWith("/recipes/query")&&request.postDataJSON()?.filters?.maxMinutes===20);
  await page.getByRole("button",{name:"查找菜谱"}).click();
  await sent;
  await page.getByRole("button",{name:"收藏",exact:true}).click();
  await expect(page.getByRole("button",{name:"已收藏",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"我的收藏"}).click();
  await expect(page.getByRole("heading",{name:"测试用南瓜粥"})).toBeVisible();
  await page.getByRole("link",{name:"查看菜谱"}).click();
  await expect(page.getByRole("heading",{name:"测试用南瓜粥",level:1})).toBeVisible();
});
