import {expect,test} from "@playwright/test";

test("the kitchen links to the PRD account groups and highlights the current tab", async ({page}) => {
  await page.route("**/api/v1/recommendations", route => route.fulfill({
    json: {data: {status: "no_candidates", results: []}},
  }));
  await page.goto("/kitchen");
  const tabs = page.getByRole("navigation", {name: "主导航"});
  await expect(tabs.getByRole("link")).toHaveText(["厨房", "菜谱", "做饭"]);
  await expect(tabs.getByRole("link", {name: "厨房"})).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", {name: "个人中心"}).click();
  await expect(page.getByRole("heading", {name: "我的食养档案"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "隐私与设置"})).toBeVisible();
  await page.getByRole("link", {name: "饮食限制与过敏原"}).click();
  await expect(page.getByRole("heading", {name: "我的食养档案", level: 1})).toBeVisible();
  for (const label of ["明确忌口", "食物过敏原", "已有专业膳食限制"]) {
    await expect(page.getByText(label, {exact: false})).toBeVisible();
  }
  await expect(page.getByText("尚未提供", {exact: true})).toHaveCount(3);
  await expect(tabs).toHaveCount(0);
});

test("a guest grants use of a preference, reopens it, and clears it locally", async ({page}) => {
  await page.goto("/account/profile");
  const group=page.locator("#preferences");
  const minutes=group.getByLabel("希望总耗时（分钟）");
  await minutes.fill("30");
  await group.getByRole("button",{name:"保存",exact:true}).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("请先确认这项资料的用途");
  await group.getByRole("checkbox").check();
  await group.getByRole("button",{name:"保存",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("档案已更新");
  await page.reload();
  await expect(minutes).toHaveValue("30");
  page.once("dialog",dialog=>dialog.accept());
  await group.getByRole("button",{name:"清除资料"}).click();
  await expect(page.getByRole("status")).toContainText("这组资料已清除");
  await expect(minutes).toHaveValue("");
});
