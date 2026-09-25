import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, LayoutDashboard, LogOut, RefreshCw, Send, ShieldCheck, Users, WalletCards } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { connectWallet, sendUsdt, SUPPORTED_CHAINS, type ChainKey, type Eip1193Provider } from "@/lib/wallet";

const chainKeys = Object.keys(SUPPORTED_CHAINS) as ChainKey[];
type AdminUser = { user_id: string; email: string | null; wallet_address: string | null; chain_key: ChainKey | null };
type Deposit = { id: string; wallet_address: string; chain_key: ChainKey; tx_hash: string; status: string; amount: number | null; created_at: string };
type Transfer = { id: string; recipient_address: string; chain_key: ChainKey; amount: number; status: string; tx_hash: string | null; created_at: string };

function shorten(value: string) { return `${value.slice(0, 7)}…${value.slice(-5)}`; }

export default function AdminPage() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [chainKey, setChainKey] = useState<ChainKey>("ethereum");
  const [recipient, setRecipient] = useState("");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const stats = useMemo(() => ({ users: users.length, deposits: deposits.length, pending: deposits.filter((item) => item.status === "pending").length, transfers: transfers.length }), [deposits, transfers, users]);

  const loadAdminData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
    setAdminEmail(user.email ?? "");
    const { data: role, error: roleError } = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).eq("is_active", true).maybeSingle();
    if (roleError || !role) { setIsAdmin(false); setLoading(false); return; }
    setIsAdmin(true);
    const [userResult, depositResult, transferResult] = await Promise.all([
      supabase.from("user_profiles").select("user_id,email,wallet_address,chain_key").order("created_at", { ascending: false }),
      supabase.from("deposit_records").select("id,wallet_address,chain_key,tx_hash,status,amount,created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("admin_transfers").select("id,recipient_address,chain_key,amount,status,tx_hash,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    if (userResult.error || depositResult.error || transferResult.error) toast.error("تحقق من تشغيل مخطط Admin في Supabase.");
    setUsers((userResult.data ?? []) as AdminUser[]);
    setDeposits((depositResult.data ?? []) as Deposit[]);
    setTransfers((transferResult.data ?? []) as Transfer[]);
    setLoading(false);
  };

  useEffect(() => { void loadAdminData(); }, []);

  const connectAdminWallet = async () => {
    try {
      const nextProvider = await connectWallet("metamask");
      const accounts = await nextProvider.request({ method: "eth_accounts" }) as string[];
      setProvider(nextProvider); setWalletAddress(accounts[0] ?? "");
      toast.success("تم ربط محفظة Admin");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر ربط محفظة Admin."); }
  };

  const selectUser = (userId: string) => {
    const user = users.find((item) => item.user_id === userId);
    setRecipientUserId(userId); setRecipient(user?.wallet_address ?? ""); setChainKey(user?.chain_key ?? "ethereum");
  };

  const sendToUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!provider || !walletAddress) { toast.error("اربط محفظة Admin أولاً."); return; }
    if (!recipient.match(/^0x[a-fA-F0-9]{40}$/)) { toast.error("أدخل عنوان EVM صحيحاً."); return; }
    if (!amount || Number(amount) <= 0) { toast.error("أدخل مبلغاً صحيحاً."); return; }
    setIsSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("انتهت جلسة Admin.");
      const { data: transfer, error } = await supabase.from("admin_transfers").insert({ admin_user_id: user.id, recipient_user_id: recipientUserId || null, recipient_address: recipient, chain_key: chainKey, amount: Number(amount), status: "draft" }).select("id").single();
      if (error) throw error;
      const receipt = await sendUsdt(provider, chainKey, recipient, amount);
      await supabase.from("admin_transfers").update({ status: "confirmed", tx_hash: receipt?.hash, updated_at: new Date().toISOString() }).eq("id", transfer.id);
      toast.success("تم توقيع وتحويل USDT من محفظة Admin");
      setAmount(""); await loadAdminData();
    } catch (error) { toast.error(error instanceof Error ? error.message : "تم رفض المعاملة أو تعذر تسجيلها."); }
    finally { setIsSending(false); }
  };

  const changeAdminEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newEmail.includes("@")) { toast.error("أدخل بريداً صحيحاً."); return; }
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) toast.error(error.message);
    else { setNewEmail(""); toast.success("تم إرسال رابط تأكيد البريد الجديد."); }
  };

  if (loading) return <div className="admin-state" dir="rtl">جارٍ التحقق من صلاحيات Admin…</div>;
  if (!isAdmin) return <div className="admin-state" dir="rtl"><ShieldCheck size={28} /><h1>الوصول مقيّد</h1><p>هذه المساحة مخصصة لحساب Admin المصرح به.</p><Link href="/" className="admin-back-link"><ArrowLeft size={15} /> العودة للرئيسية</Link></div>;

  return <div className="admin-page" dir="rtl">
    <aside className="admin-sidebar"><Link href="/" className="admin-logo"><span>ن</span> noura <small>ADMIN CONSOLE</small></Link><div className="admin-side-label">الإدارة</div><a className="active"><LayoutDashboard size={16} /> لوحة التحكم</a><a href="#users"><Users size={16} /> المستخدمون</a><a href="#deposits"><WalletCards size={16} /> الإيداعات</a><a href="#transfers"><Send size={16} /> تحويلات Admin</a><div className="admin-sidebar-footer"><span>{adminEmail}</span><button onClick={async () => { await supabase.auth.signOut(); navigate("/login"); }}><LogOut size={15} /> تسجيل الخروج</button></div></aside>
    <main className="admin-main"><div className="admin-topbar"><div><span className="admin-kicker"><ShieldCheck size={14} /> جلسة Admin موثقة</span><h1>مركز التحكم</h1><p>إدارة المستخدمين، الإيداعات، ومحفظة Admin من مساحة محمية.</p></div><button className="admin-refresh" onClick={() => void loadAdminData()}><RefreshCw size={15} /> تحديث البيانات</button></div>
      <section className="admin-stats"><div><Users size={19} /><span>المستخدمون</span><strong>{stats.users}</strong></div><div><WalletCards size={19} /><span>الإيداعات</span><strong>{stats.deposits}</strong></div><div><RefreshCw size={19} /><span>قيد المراجعة</span><strong>{stats.pending}</strong></div><div><Send size={19} /><span>تحويلات Admin</span><strong>{stats.transfers}</strong></div></section>
      <section className="admin-grid"><div className="admin-panel" id="users"><div className="admin-panel-title"><div><span>01</span><h2>المستخدمون والمحافظ</h2></div><Users size={19} /></div><div className="admin-table">{users.length === 0 ? <div className="admin-empty">لا يوجد مستخدمون بعد.</div> : users.slice(0, 8).map((user) => <div className="admin-row" key={user.user_id}><div className="admin-avatar">{(user.email ?? "U").slice(0, 1).toUpperCase()}</div><div><strong>{user.email ?? "بدون بريد"}</strong><small>{user.wallet_address ? shorten(user.wallet_address) : "لم يربط محفظة"} · {user.chain_key ?? "—"}</small></div><span className={user.wallet_address ? "admin-tag ready" : "admin-tag"}>{user.wallet_address ? "محفظة مرتبطة" : "بانتظار الربط"}</span></div>)}</div></div>
      <div className="admin-panel" id="deposits"><div className="admin-panel-title"><div><span>02</span><h2>آخر الإيداعات</h2></div><WalletCards size={19} /></div><div className="admin-table">{deposits.length === 0 ? <div className="admin-empty">لا توجد إيداعات مسجلة.</div> : deposits.slice(0, 8).map((deposit) => <div className="admin-row" key={deposit.id}><div className={`admin-status ${deposit.status}`}>{deposit.status === "completed" ? "✓" : "…"}</div><div><strong>{deposit.amount ? `${deposit.amount} USDT` : "USDT"}</strong><small>{deposit.chain_key} · {shorten(deposit.tx_hash)}</small></div><span className={`admin-tag ${deposit.status}`}>{deposit.status === "completed" ? "مكتملة" : deposit.status === "failed" ? "فاشلة" : "قيد المراجعة"}</span><a href={`${SUPPORTED_CHAINS[deposit.chain_key].explorer}/tx/${deposit.tx_hash}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a></div>)}</div></div></section>
      <section className="admin-transfer-panel" id="transfers"><div className="admin-panel-title"><div><span>03</span><h2>إرسال من محفظة Admin</h2><p>كل تحويل يتطلب مراجعة وتوقيعاً يدوياً داخل المحفظة.</p></div><Send size={19} /></div>{!provider ? <button className="admin-wallet-connect" onClick={() => void connectAdminWallet()}><WalletCards size={17} /> ربط محفظة Admin</button> : <form className="admin-transfer-form" onSubmit={sendToUser}><div className="admin-wallet-connected"><ShieldCheck size={15} /> متصل: {shorten(walletAddress)}</div><label>المستخدم المستلم<select value={recipientUserId} onChange={(event) => selectUser(event.target.value)}><option value="">اختيار مستخدم أو إدخال عنوان يدوياً</option>{users.map((user) => <option value={user.user_id} key={user.user_id}>{user.email ?? user.user_id}</option>)}</select></label><label>عنوان المحفظة<input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" dir="ltr" /></label><div className="admin-form-row"><label>الشبكة<select value={chainKey} onChange={(event) => setChainKey(event.target.value as ChainKey)}>{chainKeys.map((key) => <option value={key} key={key}>{SUPPORTED_CHAINS[key].name}</option>)}</select></label><label>المبلغ<input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00 USDT" inputMode="decimal" dir="ltr" /></label></div><button className="admin-send-button" disabled={isSending}>{isSending ? "بانتظار توقيعك…" : <>مراجعة وتحويل USDT <Send size={16} /></>}</button><div className="admin-warning"><ShieldCheck size={14} /> تحقق من العنوان والشبكة والمبلغ قبل التوقيع. التحويلات على البلوكشين غير قابلة للعكس.</div></form>}</section>
      <section className="admin-settings"><div><span className="admin-kicker">إعدادات الوصول</span><h2>تغيير بريد Admin</h2><p>سيُرسل رابط تأكيد إلى البريد الجديد، وتبقى صلاحية Admin محفوظة.</p></div><form onSubmit={changeAdminEmail}><input value={newEmail} onChange={(event) => setNewEmail(event.target.value)} type="email" placeholder={adminEmail} /><button type="submit">إرسال رابط التأكيد</button></form></section>
    </main>
  </div>;
}
