import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpLeft,
  BarChart3,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Home as HomeIcon,
  History,
  Instagram,
  Layers,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Twitter,
  UserRound,
  UserCircle,
  WalletCards,
  Zap,
} from "lucide-react";
import { getSupabaseErrorMessage, supabase } from "@/lib/supabase";
import { loadUserDeposits } from "@/lib/walletData";

function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`brand ${light ? "brand-light" : ""}`} aria-label="Noura - الصفحة الرئيسية">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="brand-name">noura</span>
    </Link>
  );
}

function Header() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Logo />
        <nav className="nav-links" aria-label="التنقل الرئيسي">
          <Link href="/">الرئيسية</Link>
          <Link href="/wallet">المحفظة</Link>
          <a href="#features">المزايا</a>
          <a href="#rhythm">المسارات</a>
          <a href="#faq">الأسئلة الشائعة</a>
        </nav>
        <div className="header-actions">
          <Link href="/login" className="button button-ghost button-small">تسجيل الدخول</Link>
          <Link href="/wallet" className="button button-accent button-small">دخول المحفظة <ArrowUpLeft size={16} /></Link>
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="التنقل السريع">
      <Link href="/" className="bottom-nav-link"><HomeIcon size={18} /><span>الرئيسية</span></Link>
      <Link href="/wallet" className="bottom-nav-link"><WalletCards size={17} /><span>المحفظة</span></Link>
      <a href="#features" className="bottom-nav-link"><Sparkles size={17} /><span>المزايا</span></a>
      <a href="#rhythm" className="bottom-nav-link"><TrendingUp size={17} /><span>المسارات</span></a>
      <Link href="/login" className="bottom-nav-link"><LogIn size={17} /><span>الدخول</span></Link>
      <Link href="/wallet" className="bottom-nav-link bottom-nav-cta"><ArrowUpLeft size={17} /><span>المحفظة</span></Link>
    </nav>
  );
}

function ShowcaseCard() {
  return (
    <div className="showcase-wrapper" aria-label="معاينة محفظة استثمارية نشطة">
      <div className="showcase-glow-bg" />
      
      {/* Floating badges */}
      <div className="floating-badge floating-badge-top">
        <div className="badge-icon-box green">
          <Check size={16} />
        </div>
        <div>
          <span>تم تأكيد إيداع 1,500 USDT</span>
        </div>
      </div>

      <div className="floating-badge floating-badge-bottom">
        <div className="badge-icon-box gold">
          <ShieldCheck size={17} />
        </div>
        <div>
          <span>أمان غير وصائي 100%</span>
        </div>
      </div>

      {/* Main Glass Portfolio Card */}
      <div className="showcase-card">
        <div className="showcase-header">
          <div>
            <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--ink)" }}>المحفظة الرقمية النشطة</span>
            <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>متصل عبر Web3 Provider</div>
          </div>
          <span className="showcase-status">
            <span className="status-pulse" /> مباشر
          </span>
        </div>

        <div className="showcase-balance-label">إجمالي قيمة الأصول التقديرية</div>
        <div className="showcase-balance-row">
          <div className="showcase-balance-val">$48,620.50</div>
          <div className="showcase-profit-badge">+18.4% ↑</div>
        </div>

        <div className="allocation-bar-wrap">
          <div className="allocation-bar-labels">
            <span>توزيع الأصول</span>
            <span>USDT (48%) · ETH (32%) · MATIC (20%)</span>
          </div>
          <div className="allocation-bar">
            <div className="bar-seg bar-usdt" title="USDT: 48%" />
            <div className="bar-seg bar-eth" title="Ethereum: 32%" />
            <div className="bar-seg bar-matic" title="Polygon: 20%" />
          </div>
        </div>

        <div className="showcase-networks-row">
          <div className="network-chip">
            <span className="network-dot eth" />
            <span>Ethereum</span>
          </div>
          <div className="network-chip">
            <span className="network-dot poly" />
            <span>Polygon</span>
          </div>
          <div className="network-chip">
            <span className="network-dot arb" />
            <span>Arbitrum</span>
          </div>
          <div className="network-chip">
            <span className="network-dot bsc" />
            <span>BSC</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveTicker() {
  const tickers = [
    { label: "ETH / USDT", sub: "إيثيريوم", val: "$3,284.10", change: "+3.4%" },
    { label: "BTC / USDT", sub: "بيتكوين", val: "$64,950.00", change: "+2.8%" },
    { label: "POL / USDT", sub: "بوليغون", val: "$0.72", change: "+4.9%" },
    { label: "حماية المحفظة", sub: "عقود ذكية مشفرة", val: "غير وصائية", change: "100% أمان" },
  ];

  return (
    <section className="ticker-band" aria-label="شريط أداء السوق المباشر">
      <div className="shell">
        <div className="ticker-grid">
          {tickers.map((t) => (
            <div className="ticker-item" key={t.label}>
              <div>
                <strong>{t.label}</strong>
                <small>{t.sub}</small>
              </div>
              <div>
                <span className="ticker-val">{t.val}</span>
                <span className="ticker-change">{t.change}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: <ShieldCheck size={26} />,
      colorClass: "emerald",
      title: "محفظة غير وصائية بالكامل",
      description: "مفاتيحك الخاصة وأصولك ملكك تماماً. لا وسطاء، لا أحد يستطيع تجميد أو حجز رصيدك.",
    },
    {
      icon: <Layers size={26} />,
      colorClass: "blue",
      title: "دعم تعدد الشبكات (Multi-Chain)",
      description: "تنقل بسهولة بين Ethereum وPolygon وArbitrum وBSC لإدارة معاملاتك بأقل رسوم ممكنة.",
    },
    {
      icon: <TrendingUp size={26} />,
      colorClass: "gold",
      title: "تحليلات واضحة للمخاطر",
      description: "تعرف على مستويات المخاطر وتوزيع العملات قبل أي خطوة لتحقيق نمو مالي متزن ومدروس.",
    },
    {
      icon: <Zap size={26} />,
      colorClass: "purple",
      title: "ربط لحظي عبر Web3",
      description: "اتصل بأمان بمحفظتك المفضلة مثل MetaMask أو WalletConnect دون أي كلمات مرور مخزنة.",
    },
  ];

  return (
    <section id="features" className="features-section shell">
      <div className="section-intro-center">
        <span className="eyebrow-pill"><Sparkles size={14} /> مزايا نورة الفريدة</span>
        <h2>منظومة استثمارية متكاملة تضمن وضوح قراراتك</h2>
        <p>صممنا كل ميزة لتمنحك الأمان المطلق والسهولة التامة في مراقبة وإدارة أصولك الرقمية.</p>
      </div>
      <div className="features-grid">
        {features.map((f) => (
          <div className="feature-card" key={f.title}>
            <div className={`feature-icon-wrap ${f.colorClass}`}>{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DailyYieldCalculator() {
  const [amount, setAmount] = useState<number>(10);
  const [days, setDays] = useState<number>(7);

  const daily = +(amount * 0.20).toFixed(2);
  const totalProfit = +(daily * days).toFixed(2);
  const totalReturn = +(amount + totalProfit).toFixed(2);

  return (
    <section className="shell" style={{ marginBlock: "64px" }}>
      <div
        style={{
          background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
          border: "1.5px solid rgba(16, 185, 129, 0.25)",
          borderRadius: "22px",
          padding: "36px",
          boxShadow: "0 20px 45px -10px rgba(8, 17, 32, 0.08)",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "600px", margin: "0 auto 30px" }}>
          <span className="eyebrow-pill">
            <Zap size={14} /> حاسبة العوائد اليومية
          </span>
          <h2 style={{ fontSize: "clamp(26px, 3.2vw, 40px)", fontWeight: 800, marginTop: "12px", color: "var(--ink)" }}>
            استثمر واحصل على عوائد كل 24 ساعة
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "14px", marginTop: "8px", lineHeight: "1.8" }}>
            حدد كم تريد الاستثمار في محفظة الموقع لمدة أسبوع أو أكثر، وتابع أرباحك اليومية المؤكدة (20% كل 24 ساعة).
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "28px", alignItems: "center" }}>
          {/* Controls */}
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 800, color: "var(--ink)", marginBottom: "8px" }}>
              كم تريد أن تستثمر؟ (حدد المبلغ بالدولار / USDT):
            </label>
            <div className="invest-input-wrap" style={{ marginBottom: "12px" }}>
              <span className="invest-input-prefix">$</span>
              <input
                className="invest-input-field"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 0))}
              />
              <span className="invest-input-suffix">USDT</span>
            </div>

            {/* Quick Chips */}
            <div className="invest-chips-list" style={{ marginBottom: "20px" }}>
              {[
                { val: 5, label: "5$ (ربح 1$ يومياً)" },
                { val: 10, label: "10$ (ربح 2$ يومياً)" },
                { val: 25, label: "25$ (ربح 5$ يومياً)" },
                { val: 50, label: "50$ (ربح 10$ يومياً)" },
                { val: 100, label: "100$ (ربح 20$ يومياً)" },
              ].map((chip) => (
                <button
                  type="button"
                  key={chip.val}
                  className={`invest-chip-btn ${amount === chip.val ? "active" : ""}`}
                  onClick={() => setAmount(chip.val)}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <label style={{ display: "block", fontSize: "13px", fontWeight: 800, color: "var(--ink)", marginBottom: "8px" }}>
              مدة الاستثمار (أسبوع أو أكثر):
            </label>
            <div className="duration-selector-row">
              {[
                { d: 7, label: "أسبوع واحد", sub: "7 أيام" },
                { d: 14, label: "أسبوعان", sub: "14 يوماً" },
                { d: 30, label: "شهر كامل", sub: "30 يوماً" },
              ].map((item) => (
                <button
                  type="button"
                  key={item.d}
                  className={`duration-btn ${days === item.d ? "active" : ""}`}
                  onClick={() => setDays(item.d)}
                >
                  <strong>{item.label}</strong>
                  <small>{item.sub}</small>
                </button>
              ))}
            </div>
          </div>

          {/* Result Card */}
          <div
            style={{
              background: "linear-gradient(145deg, #081120 0%, #13243d 100%)",
              borderRadius: "18px",
              padding: "26px",
              color: "white",
              display: "grid",
              gap: "14px",
              boxShadow: "0 15px 35px rgba(8, 17, 32, 0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>المبلغ المحدد:</span>
              <strong style={{ fontSize: "18px", fontFamily: "Space Grotesk, sans-serif" }}>${amount} USDT</strong>
            </div>

            <div
              style={{
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "12px",
                padding: "14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ display: "block", fontSize: "11px", color: "#34d399", fontWeight: 700 }}>
                  الربح كل 24 ساعة (20% يومياً)
                </span>
                <small style={{ color: "rgba(255,255,255,0.6)" }}>يُضاف لمحفظتك كل يوم</small>
              </div>
              <strong style={{ fontSize: "24px", color: "#34d399", fontFamily: "Space Grotesk, sans-serif" }}>
                +${daily}
              </strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
              <span style={{ color: "rgba(255,255,255,0.7)" }}>إجمالي أرباح المدة ({days} أيام):</span>
              <strong style={{ color: "#fbbf24", fontFamily: "Space Grotesk, sans-serif", fontSize: "16px" }}>
                +${totalProfit} USDT
              </strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px", borderTop: "1px dashed rgba(255,255,255,0.15)", paddingTop: "10px" }}>
              <span style={{ fontWeight: 800 }}>إجمالي العائد (رأس المال + الأرباح):</span>
              <strong style={{ fontSize: "20px", color: "white", fontFamily: "Space Grotesk, sans-serif" }}>
                ${totalReturn} USDT
              </strong>
            </div>

            <Link href="/wallet" className="button button-accent button-large" style={{ marginTop: "8px", width: "100%" }}>
              ابدأ هذا الاستثمار الآن في المحفظة <ArrowUpLeft size={18} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const faqs = [
    {
      q: "هل تحتفظ المنصة بمفاتيحي الخاصة أو أموالي؟",
      a: "إطلاقاً. نورة منصة غير وصائية بالكامل (Non-Custodial)، جميع المعاملات وتوقيعات العقود تتم من محفظتك الخاصة مباشرة، ولا نملك أي وصول إلى أموالك أو مفاتيحك السرية.",
    },
    {
      q: "ما هي المحافظ المدعومة للاتصال بالمنصة؟",
      a: "ندعم جميع محافظ Web3 الرائدة بما في ذلك MetaMask وCoinbase Wallet وTrust Wallet وأكثر من 300 محفظة هاتفية ومتصفح عبر بروتوكول WalletConnect القياسي.",
    },
    {
      q: "كيف تساعدني مسارات الاستثمار في تقليل المخاطر؟",
      a: "توفر المنصة تصنيفاً دقيقاً للمخاطر مع التركيز على توزيع العملات المستقرة والشبكات منخفضة التكلفة، لتمكينك من اتخاذ قرارات متوازنة تناسب أهدافك.",
    },
    {
      q: "هل أستطيع تحويل أو سحب أصولي في أي وقت؟",
      a: "نعم وبكل سهولة. نظراً لأنك أنت المالك المباشر لمحفظتك وعناوينك على البلوكشين، يمكنك تحويل أو إيداع أو سحب أصولك في أي ثانية دون أي قيود أو موافقات إدارية.",
    },
  ];

  return (
    <section id="faq" className="faq-section shell">
      <div className="section-intro-center">
        <span className="eyebrow-pill"><MessageCircle size={14} /> الأسئلة الشائعة</span>
        <h2>كل ما تحتاج معرفته عن نورة</h2>
        <p>إجابات شفافة ومباشرة على أكثر الأسئلة تكراراً حول الأمان وآلية العمل.</p>
      </div>
      <div className="faq-list">
        {faqs.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div className={`faq-item ${isOpen ? "open" : ""}`} key={faq.q}>
              <button
                type="button"
                className="faq-button"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
              >
                <span>{faq.q}</span>
                <ChevronDown
                  size={18}
                  style={{
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                />
              </button>
              {isOpen && <div className="faq-answer">{faq.a}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

type DashboardUser = { id: string; email?: string; user_metadata?: { full_name?: string } };
type MarketItem = { symbol: string; name: string; price: number; change: number };

function UserDashboard({ user }: { user: DashboardUser }) {
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState<"overview" | "profile" | "market" | "wallet" | "history" | "investment">("overview");
  const [market, setMarket] = useState<MarketItem[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const fullName = user.user_metadata?.full_name?.trim() || "مستثمر نورة";

  useEffect(() => {
    let cancelled = false;
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,polygon&vs_currencies=usd&include_24hr_change=true")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("market")))
      .then((data: Record<string, { usd?: number; usd_24h_change?: number }>) => {
        if (cancelled) return;
        setMarket([
          { symbol: "BTC", name: "Bitcoin", price: data.bitcoin?.usd ?? 0, change: data.bitcoin?.usd_24h_change ?? 0 },
          { symbol: "ETH", name: "Ethereum", price: data.ethereum?.usd ?? 0, change: data.ethereum?.usd_24h_change ?? 0 },
          { symbol: "USDT", name: "Tether", price: data.tether?.usd ?? 1, change: data.tether?.usd_24h_change ?? 0 },
          { symbol: "POL", name: "Polygon", price: data.polygon?.usd ?? 0, change: data.polygon?.usd_24h_change ?? 0 },
        ]);
      })
      .catch(() => { if (!cancelled) setMarket([{ symbol: "BTC", name: "Bitcoin", price: 0, change: 0 }, { symbol: "ETH", name: "Ethereum", price: 0, change: 0 }, { symbol: "USDT", name: "Tether", price: 1, change: 0 }]); });
    void loadUserDeposits(user.id).then((records) => { if (!cancelled) setHistoryCount(records.length); });
    return () => { cancelled = true; };
  }, [user.id]);

  const signOut = async () => { await supabase.auth.signOut(); toast.success("تم تسجيل الخروج بأمان"); setLocation("/"); };
  const menu = [
    { id: "overview" as const, label: "الرئيسية", icon: HomeIcon },
    { id: "profile" as const, label: "معلوماتي", icon: UserCircle },
    { id: "market" as const, label: "السوق", icon: BarChart3 },
    { id: "wallet" as const, label: "المحفظة", icon: WalletCards },
    { id: "history" as const, label: "السجل", icon: History },
    { id: "investment" as const, label: "الاستثمار", icon: TrendingUp },
  ];

  return (
    <div className="user-dashboard" dir="rtl">
      <header className="user-dashboard-header"><Logo /><div className="user-welcome"><span>مرحباً،</span><strong>{fullName}</strong></div><button type="button" className="user-signout" onClick={() => void signOut()}><LogOut size={16} /> خروج</button></header>
      <div className="user-dashboard-layout">
        <aside className="user-sidebar"><div className="user-sidebar-profile"><div className="user-avatar"><UserRound size={22} /></div><div><strong>{fullName}</strong><small>{user.email}</small></div></div><nav aria-label="قائمة المستخدم">{menu.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={activeSection === item.id ? "active" : ""} onClick={() => setActiveSection(item.id)}><Icon size={17} /><span>{item.label}</span></button>; })}</nav></aside>
        <main className="user-dashboard-main">
          {activeSection === "overview" && <><div className="user-section-heading"><span className="eyebrow-pill"><Sparkles size={14} /> مساحة المستخدم</span><h1>لوحتك المالية في مكان واحد.</h1><p>تابع محفظتك، السوق، وسجل عملياتك من واجهة واحدة متزامنة مع حسابك.</p></div><div className="user-summary-grid"><div className="user-summary-card dark"><small>حالة الحساب</small><strong>نشط</strong><span>متصل بـ Supabase Auth</span></div><div className="user-summary-card"><small>سجل العمليات</small><strong>{historyCount}</strong><span>إيداعات مسجلة في حسابك</span></div><div className="user-summary-card accent"><small>المحفظة غير الوصائية</small><strong>Web3</strong><span>أنت تملك مفاتيحك وأصولك</span></div></div><div className="user-feature-grid"><button type="button" onClick={() => setActiveSection("wallet")}><WalletCards size={23} /><strong>محفظتي</strong><span>اربط MetaMask أو WalletConnect وأدر USDT.</span></button><button type="button" onClick={() => setActiveSection("market")}><BarChart3 size={23} /><strong>السوق المباشر</strong><span>راقب أسعار العملات وتغيرها خلال 24 ساعة.</span></button><button type="button" onClick={() => setActiveSection("investment")}><TrendingUp size={23} /><strong>مساحة الاستثمار</strong><span>راجع خيارات الإيداع والاستثمار قبل التوقيع.</span></button></div></>}
          {activeSection === "profile" && <section className="user-panel"><h2><UserCircle size={23} /> معلوماتي الشخصية</h2><div className="profile-details"><div><small>الاسم</small><strong>{fullName}</strong></div><div><small>البريد الإلكتروني</small><strong dir="ltr">{user.email}</strong></div><div><small>معرّف الحساب</small><strong className="mono">{user.id}</strong></div><div><small>حالة الحساب</small><strong>متصل عبر Supabase</strong></div></div></section>}
          {activeSection === "market" && <section className="user-panel"><div className="panel-heading"><h2><BarChart3 size={23} /> السوق المباشر</h2><span>بيانات عامة من CoinGecko</span></div><div className="market-table">{market.map((item) => <div className="market-row" key={item.symbol}><div className="market-coin"><b>{item.symbol}</b><span>{item.name}</span></div><strong>{item.price ? `$${item.price.toLocaleString("en-US", { maximumFractionDigits: item.price < 2 ? 4 : 2 })}` : "—"}</strong><span className={item.change >= 0 ? "market-up" : "market-down"}>{item.change ? `${item.change >= 0 ? "+" : ""}${item.change.toFixed(2)}%` : "—"}</span></div>)}</div></section>}
          {activeSection === "wallet" && <section className="user-panel"><h2><WalletCards size={23} /> محفظتي الرقمية</h2><p>المحفظة غير وصائية: لا تُرسل الأموال إلى أي عنوان إلا بعد مراجعته وتوقيعه من محفظتك.</p><Link href="/wallet" className="button button-accent button-large">فتح المحفظة وربط Web3 <ArrowUpLeft size={18} /></Link></section>}
          {activeSection === "history" && <section className="user-panel"><h2><History size={23} /> السجل الخاص بي</h2><p>كل إيداعاتك وحالات مراجعتها محفوظة في قاعدة Supabase الخاصة بحسابك.</p><div className="history-empty"><History size={28} /><strong>{historyCount ? `${historyCount} عملية مسجلة` : "لا توجد عمليات بعد"}</strong><span>ستظهر معاملاتك هنا بعد إرسال أول إيداع.</span></div></section>}
          {activeSection === "investment" && <section className="user-panel investment-user-panel"><h2><TrendingUp size={23} /> الاستثمار</h2><div className="investment-notice"><ShieldCheck size={21} /><div><strong>محفظة الاستثمار تحت اختيارك</strong><p>اختر المبلغ، ثم انتقل إلى المحفظة لإيداع USDT أو إرساله. لا يتم تحويل أي أموال تلقائياً ولا يتم الخصم دون توقيعك.</p></div></div><Link href="/wallet" className="button button-accent button-large">اختيار مبلغ الاستثمار في المحفظة <ArrowUpLeft size={18} /></Link></section>}
        </main>
      </div>
      <nav className="user-mobile-nav" aria-label="قائمة المستخدم السفلية">{menu.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={activeSection === item.id ? "active" : ""} onClick={() => setActiveSection(item.id)}><Icon size={17} /><span>{item.label}</span></button>; })}</nav>
    </div>
  );
}

function PublicHome() {
  return (
    <div className="site-page" dir="rtl">
      <Header />
      <main>
        {/* Hero Section */}
        <section className="hero-section shell">
          <div className="hero-copy reveal-up">
            <span className="eyebrow-pill">
              <Sparkles size={14} /> منصة استثمار الأصول الرقمية والويب 3
            </span>
            <h1>
              ابنِ محفظتك،
              <br />
              <span className="gradient-text">وتحكّم بمستقبلك المالي.</span>
            </h1>
            <p className="hero-description">
              نورة تمنحك مساحة ذكية وآمنة لإدارة أصولك المشفرة، مقارنة الشبكات، ومتابعة تحليلات المخاطر دون أي وصاية على أموالك.
            </p>
            <div className="hero-actions">
              <Link href="/wallet" className="button button-accent button-large">
                افتح محفظتك الآن <ArrowUpLeft size={18} />
              </Link>
              <a href="#features" className="button button-outline button-large">
                استكشف المزايا <ChevronDown size={17} />
              </a>
            </div>
            <div className="trust-row">
              <span className="avatar-stack">
                <i>س</i>
                <i>ل</i>
                <i>ن</i>
              </span>
              <span>
                محافظ غير وصائية 100%، وتشفير Web3 متطور، و<strong>تحكمك يبقى معك دائماً.</strong>
              </span>
            </div>
          </div>

          <div className="hero-visual reveal-up delay-one">
            <ShowcaseCard />
          </div>
        </section>

        {/* Live Market Ticker */}
        <LiveTicker />

        {/* Features Section */}
        <FeaturesSection />

        {/* Interactive 24h Daily Yield Calculator */}
        <DailyYieldCalculator />

        {/* Story Section */}
        <section id="story" className="story-section shell">
          <div className="section-label">
            <span>01</span>
            <span>فلسفة الاستثمار والشفافية</span>
          </div>
          <div className="story-grid">
            <h2>
              قرارك المالي
              <br />
              <span>يبدأ بالوضوح التام.</span>
            </h2>
            <div className="story-body">
              <p>
                نحن لا نعد بأوهام الأرباح السريعة. نمنحك الأدوات التقنية المتطورة لفهم وتوزيع أصولك، مقارنة كفاءة الشبكات، ومتابعة نمو محفظتك قبل أن تتخذ أي قرار.
              </p>
              <Link href="/wallet" className="inline-link">
                استكشف المحفظة وتفاصيلها <ArrowUpLeft size={16} />
              </Link>
            </div>
          </div>
        </section>

        {/* Investment Tracks Section */}
        <section id="rhythm" className="rhythm-section">
          <div className="shell rhythm-grid">
            <div className="rhythm-intro">
              <div className="section-label light-label">
                <span>02</span>
                <span>مساراتك الاستثمارية</span>
              </div>
              <h2>
                خطط أذكى.
                <br />
                <em>مخاطر أوضح.</em>
              </h2>
              <p>
                اختر المسار الذي يطابق أهدافك الاستثمارية، واطلع على مستوى المخاطر المتوقع وخصائص كل خيار بوضوح.
              </p>
            </div>
            <div className="investment-cards-list">
              {[
                {
                  id: "01",
                  title: "خطة استثمار 5$",
                  description: "استثمر 5$ واحصل على 1$ كل 24 ساعة (إجمالي 7$ أرباح خلال أسبوع).",
                  risk: "+1$ كل 24 ساعة",
                  riskClass: "low",
                  popular: false,
                },
                {
                  id: "02",
                  title: "خطة استثمار 10$",
                  description: "استثمر 10$ واحصل على 2$ كل 24 ساعة (إجمالي 14$ أرباح خلال أسبوع).",
                  risk: "+2$ كل 24 ساعة",
                  riskClass: "mid",
                  popular: true,
                },
                {
                  id: "03",
                  title: "خطة استثمار مخصصة (حدد المبلغ)",
                  description: "حدد أي مبلغ تريده (25$، 50$، 100$...) مع نسبة ربح 20% كل 24 ساعة وسحب يومي فوري.",
                  risk: "20% يومياً",
                  riskClass: "high",
                  popular: false,
                },
              ].map((track) => (
                <div className={`track-card ${track.popular ? "popular" : ""}`} key={track.id}>
                  <span className="track-num">{track.id}</span>
                  <div className="track-info">
                    <strong>{track.title}</strong>
                    <small>{track.description}</small>
                    <span className={`track-badge ${track.riskClass}`}>{track.risk}</span>
                  </div>
                  <Link href="/wallet" className="button button-small button-outline">
                    استثمر الآن <ArrowUpLeft size={14} />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <FAQSection />

        {/* Final CTA */}
        <section id="contact" className="shell">
          <div className="final-cta">
            <div>
              <span className="eyebrow-pill">
                <Sparkles size={14} /> انطلق اليوم
              </span>
              <h2>
                جاهز لبناء محفظتك
                <br />
                <em>بأمان واحترافية؟</em>
              </h2>
              <p>
                ابدأ رحلتك خلال ثوانٍ معدودة. اربط محفظتك الرقمية واستمتع بتجربة إدارة أصول غير وصائية بمقاييس عالمية.
              </p>
            </div>
            <div className="final-cta-actions">
              <Link href="/wallet" className="button button-accent button-large">
                افتح محفظتك الآن <ArrowUpLeft size={18} />
              </Link>
              <Link href="/signup" className="button button-outline button-large">
                إنشاء حساب مجاني
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer shell">
        <Logo />
        <p>نورة — منصة استثمار وإدارة محافظ رقمية غير وصائية مبنية للوضوح والأمان.</p>
        <div className="footer-social">
          <a href="https://twitter.com" target="_blank" rel="noreferrer" aria-label="Twitter">
            <Twitter size={18} />
          </a>
          <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram">
            <Instagram size={18} />
          </a>
        </div>
        <span className="copyright">© 2026 noura. All rights reserved.</span>
      </footer>

      <BottomNav />
    </div>
  );
}

function AuthShell({
  children,
  title,
  description,
  mode,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  mode: "login" | "signup";
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="auth-page" dir="rtl">
      <div className="auth-aside">
        <div className="auth-aside-top">
          <Logo light />
          <Link href="/" className="back-home">
            <ArrowLeft size={16} /> العودة للرئيسية
          </Link>
        </div>
        <div className="auth-aside-content">
          <div className="eyebrow eyebrow-light">
            <Sparkles size={14} /> استثمر بوعي. تحرّك بوضوح.
          </div>
          <h1>
            ابدأ من المكان
            <br />
            <em>الذي ينمّي رؤيتك.</em>
          </h1>
          <p>خطوة واضحة اليوم، ومساحة أوسع لقراراتك غداً.</p>
          <div className="aside-stamp">
            <span>ن</span>
            <div>
              <strong>noura</strong>
              <small>your smarter space</small>
            </div>
          </div>
        </div>
        <div className="auth-aside-footer">
          بيانات أوضح لقرارات استثمارية أذكى <span>✦</span>
        </div>
      </div>
      <main className="auth-main">
        <div className="auth-card">
          <div className="mobile-auth-logo">
            <Logo />
          </div>
          <div className="auth-heading">
            <span className="auth-kicker">
              {mode === "login" ? "مرحباً بعودتك" : "أهلاً بك في نورة"}
            </span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          {children}
          <div className="auth-switch">
            {mode === "login" ? (
              <>
                ليس لديك حساب؟ <Link href="/signup">أنشئ حساباً مجانياً</Link>
              </>
            ) : (
              <>
                لديك حساب بالفعل؟ <Link href="/login">تسجيل الدخول</Link>
              </>
            )}
          </div>
          <button className="back-link" onClick={() => setLocation("/")}>
            <ArrowLeft size={15} /> العودة للصفحة الرئيسية
          </button>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

function PasswordField({
  label,
  id,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <LockKeyhole size={17} />
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required
        />
        <button
          type="button"
          className="input-action"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </label>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setLocation] = useLocation();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);
    if (error) {
      toast.error(getSupabaseErrorMessage(error.message));
      return;
    }
    toast.success("تم تسجيل الدخول بنجاح", { description: "مرحباً بعودتك إلى نورة." });
    setLocation("/");
  };

  return (
    <AuthShell mode="login" title="تسجيل الدخول" description="أدخل بياناتك للعودة إلى مساحتك.">
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>البريد الإلكتروني</span>
          <div className="input-wrap">
            <Mail size={17} />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              dir="ltr"
              required
            />
          </div>
        </label>
        <PasswordField
          label="كلمة المرور"
          id="login-password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
        />
        <div className="form-row">
          <label className="check-label">
            <input type="checkbox" /> <span>تذكرني</span>
          </label>
          <a
            href="#forgot"
            onClick={(event) => {
              event.preventDefault();
              toast.info("سنرسل لك رابط استعادة كلمة المرور قريباً.");
            }}
          >
            نسيت كلمة المرور؟
          </a>
        </div>
        <button className="button button-dark submit-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "جارٍ تسجيل الدخول…" : <>تسجيل الدخول <ArrowUpLeft size={17} /></>}
        </button>
      </form>
      <div className="auth-divider">
        <span>أو تابع باستخدام</span>
      </div>
      <button
        type="button"
        className="social-button"
        onClick={() => toast.info("تسجيل الدخول بواسطة Google سيكون متاحاً قريباً.")}
      >
        <span className="google-mark">G</span> المتابعة باستخدام Google
      </button>
    </AuthShell>
  );
}

export function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setLocation] = useLocation();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
      },
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(getSupabaseErrorMessage(error.message));
      return;
    }
    if (data.session) {
      toast.success("تم إنشاء حسابك", { description: "أهلاً بك في مساحتك الجديدة." });
      setLocation("/");
    } else {
      toast.error("لم يتم فتح الحساب مباشرة", { description: "عطّل خيار Confirm email من إعدادات Authentication في Supabase ثم حاول مرة أخرى." });
    }
  };

  return (
    <AuthShell mode="signup" title="إنشاء حساب" description="أنشئ مساحتك المجانية في أقل من دقيقة.">
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>الاسم الكامل</span>
          <div className="input-wrap">
            <UserRound size={17} />
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="مثلاً: نور أحمد"
              required
            />
          </div>
        </label>
        <label className="field">
          <span>البريد الإلكتروني</span>
          <div className="input-wrap">
            <Mail size={17} />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              dir="ltr"
              required
            />
          </div>
        </label>
        <PasswordField
          label="كلمة المرور"
          id="signup-password"
          value={password}
          onChange={setPassword}
          placeholder="8 أحرف على الأقل"
        />
        <label className="check-label terms">
          <input type="checkbox" required />
          <span>
            أوافق على <a href="#terms">الشروط والأحكام</a> وسياسة الخصوصية.
          </span>
        </label>
        <button className="button button-accent submit-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "جارٍ إنشاء الحساب…" : <>إنشاء حساب مجاني <ArrowUpLeft size={17} /></>}
        </button>
      </form>
      <div className="auth-divider">
        <span>أو تابع باستخدام</span>
      </div>
      <button
        type="button"
        className="social-button"
        onClick={() => toast.info("التسجيل بواسطة Google سيكون متاحاً قريباً.")}
      >
        <span className="google-mark">G</span> التسجيل باستخدام Google
      </button>
    </AuthShell>
  );
}

export default function Home() {
  const [user, setUser] = useState<DashboardUser | null>(null);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => { if (mounted) setUser(data.user as DashboardUser | null); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (mounted) setUser((session?.user as DashboardUser | undefined) ?? null); });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  return user ? <UserDashboard user={user} /> : <PublicHome />;
}
