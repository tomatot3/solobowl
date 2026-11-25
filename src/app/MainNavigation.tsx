"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";

const tabs = [
  {href: "/kitchen", label: "厨房", icon: "home"},
  {href: "/recipes", label: "菜谱", icon: "book"},
  {href: "/cooking", label: "做饭", icon: "pot"},
] as const;

export default function MainNavigation() {
  const path = usePathname();
  if (path === "/" || path === "/welcome" || path.startsWith("/account") || path === "/goods" || path.startsWith("/recipes/") || path.startsWith("/cooking/")) return null;
  return <nav aria-label="主导航" className="tabs">{tabs.map(tab => (
    <Link key={tab.href} href={tab.href} aria-current={path === tab.href || path==="/shopping"&&tab.href==="/cooking" || path.startsWith("/kitchen/")&&tab.href==="/kitchen" ? "page" : undefined}>
      <span aria-hidden="true" className={`tab-icon tab-${tab.icon}`} />
      {tab.label}
    </Link>
  ))}</nav>;
}
