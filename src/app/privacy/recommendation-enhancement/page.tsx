import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "推荐理由增强处理告知 · 食有数" };

export default function RecommendationEnhancementNotice() {
  return (
    <main className="account-main">
      <div className="page-title">
        <Link href="/account/profile">‹ 返回档案</Link>
        <h1>推荐理由增强处理告知</h1>
      </div>
      <section className="panel account-group">
        <h2>调用 OpenAI 的时机</h2>
        <p>登录并授权后，你在厨房点击「尝试增强推荐理由」时，食有数才调用 OpenAI API，从已有理由标签中选择适合本次推荐的标签。</p>
        <h2>发送的信息</h2>
        <p>请求包含已选菜谱及版本的编号、主推或备选标记、当前节气和可用理由标签。账号资料、饮食档案、过敏信息和今日文字留在食有数。</p>
        <p>食有数关闭通过 API 取回响应的存储选项。OpenAI 可依其 API 政策保留用于防滥用的日志。<a href="https://developers.openai.com/api/docs/guides/your-data">查看 OpenAI 的 API 数据政策</a></p>
        <h2>撤回授权</h2>
        <p>在「个人中心 → 档案 → 推荐理由增强」可以撤回授权。撤回后，网站会显示按规则生成的理由。</p>
        <p>如对这项功能的数据处理有疑问，可通过<a href="https://github.com/tomatot3/solobowl">食有数项目页</a>联系维护者。</p>
      </section>
    </main>
  );
}
