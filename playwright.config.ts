import { defineConfig, devices } from "@playwright/test";
const demoOnly=process.env.SHIYOUSHU_E2E_DEMO_ONLY==="1";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, forbidOnly: Boolean(process.env.CI),
  workers: 2, expect: {timeout:10000},
  retries: process.env.CI ? 1 : 0, reporter: [["list"], ["html", {open:"never"}]],
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  ...(demoOnly?{testMatch:"**/full-p0.spec.ts"}:{webServer:{
    command:"node node_modules/next/dist/bin/next dev --hostname 127.0.0.1",url:"http://127.0.0.1:3000",
    reuseExistingServer:process.env.PLAYWRIGHT_REUSE_SERVER==="1",timeout:90000,
  }}),
  projects: [
    {name:"desktop-chromium", use:{...devices["Desktop Chrome"]}},
    {name:"mobile-chromium", use:{...devices["Pixel 7"]}},
    {name:"desktop-webkit", use:{...devices["Desktop Safari"]}},
    {name:"mobile-webkit", use:{...devices["iPhone 13"]}},
  ],
});
