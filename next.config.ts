import type { NextConfig } from "next";
const demo=process.env.SHIYOUSHU_DEMO==="1";
const config: NextConfig = {
  poweredByHeader: false,
  ...(demo?{devIndicators:false,distDir:".cache/next-demo",typescript:{tsconfigPath:".cache/tsconfig.demo.json"}}:{}),
};
export default config;
