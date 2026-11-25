import Link from "next/link";
import AccountIdentity from "./AccountIdentity";

export default function Account() {
  return (
    <main className="account-main">
      <div className="page-title">
        <Link href="/kitchen">‹ 返回厨房</Link>
        <h1>个人中心</h1>
      </div>
      <AccountIdentity/>
      <section className="panel account-group">
        <h2>我的食养档案</h2>
        <Link href="/account/profile" className="account-row">饮食限制与过敏原 <span aria-hidden="true">›</span></Link>
        <Link href="/account/profile#preferences" className="account-row">口味与饮食偏好 <span aria-hidden="true">›</span></Link>
      </section>
      <section className="panel account-group">
        <h2>我的记录</h2>
        <Link href="/kitchen#today-note" className="account-row">今日文字 <span aria-hidden="true">›</span></Link>
      </section>
      <section className="panel account-group">
        <h2>隐私与设置</h2>
        <Link href="/account/profile#privacy" className="account-row">资料用途与管理 <span aria-hidden="true">›</span></Link>
      </section>
      <Link href="/goods" className="panel account-row">食养好物 <span aria-hidden="true">›</span></Link>
    </main>
  );
}
