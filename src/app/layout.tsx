import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import MainNavigation from "./MainNavigation";
export const metadata: Metadata = { title: "食有数 · 冬季一人食养", description: "从一餐开始，让食养有数" };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="zh-CN"><body><header className="site-header"><Link href="/kitchen" className="brand">食有数<span aria-hidden="true">食</span></Link>
  {process.env.SHIYOUSHU_DEMO==="1"&&<span className="note demo-links">演示环境 <Link href="/kitchen/workbook-preview">查看表格原图</Link></span>}</header>{children}<MainNavigation/></body></html>;
}
