import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  Home as HomeIcon,
  Instagram,
  LockKeyhole,
  LogIn,
  Mail,
  MessageCircle,
  Sparkles,
  Twitter,
  UserRound,
  WalletCards,
} from "lucide-react";
import { getSupabaseErrorMessage, supabase } from "@/lib/supabase";

const benefits = [
  "مساحة واحدة لأفكارك ومشاريعك",
  "تنظيم بسيط يحافظ على تركيزك",
  "تجربة مصممة لتشبه إيقاعك",
];

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
      </div>
    </header>
  );
}

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="التنقل الرئيسي">
      <Link href="/" className="bottom-nav-link"><HomeIcon size={18} /><span>الرئيسية</span></Link>
      <a href="/#story" className="bottom-nav-link"><Sparkles size={17} /><span>قصتنا</span></a>
      <a href="/#rhythm" className="bottom-nav-link"><MessageCircle size={17} /><span>كيف نساعدك</span></a>
      <Link href="/wallet" className="bottom-nav-link"><WalletCards size={17} /><span>المحفظة</span></Link>
      <Link href="/login" className="bottom-nav-link"><LogIn size={17} /><span>تسجيل الدخول</span></Link>
      <Link href="/signup" className="bottom-nav-link bottom-nav-cta"><ArrowUpLeft size={17} /><span>إنشاء حساب</span></Link>
    </nav>
  );
}

function OrbitalArtwork() {
  return (
    <div className="orbital-art" aria-label="تركيبة زخرفية مستوحاة من الهلال">
      <div className="orbital-glow" />
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="orbit orbit-three" />
      <div className="moon-shape" />
      <div className="art-star star-one">✦</div>
      <div className="art-star star-two">✧</div>
      <div className="art-star star-three">·</div>
      <div className="art-caption">نحو مساحة<br /><strong>تشبهك</strong></div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="site-page" dir="rtl">
      <Header />
      <main>
        <section className="hero-section shell">
          <div className="hero-copy reveal-up">
            <div className="eyebrow"><Sparkles size={14} /> مساحة أهدأ. يوم أوضح.</div>
            <h1>رتّب أفكارك،<br /><em>واصنع مساحتك.</em></h1>
            <p className="hero-description">نورة هي المساحة الرقمية التي تمنح أفكارك وقتها، ومشاريعك مكانها، ويومك إيقاعه الخاص.</p>
            <div className="hero-actions">
              <Link href="/signup" className="button button-accent">أنشئ مساحتك <ArrowUpLeft size={18} /></Link>
              <a href="#story" className="button button-ghost">اكتشف نورة <ArrowLeft size={17} /></a>
            </div>
            <div className="trust-row"><span className="avatar-stack"><i>س</i><i>ل</i><i>ن</i></span><span>انضم إلى أكثر من <strong>12,000</strong> شخص يبدأون يومهم بوضوح.</span></div>
          </div>
          <div className="hero-visual reveal-up delay-one"><OrbitalArtwork /></div>
        </section>

        <section id="story" className="story-section shell">
          <div className="section-label"><span>01</span><span>لماذا نورة؟</span></div>
          <div className="story-grid">
            <h2>كل فكرة تستحق<br /><span>مكاناً جميلاً.</span></h2>
            <div className="story-body"><p>نحن نؤمن أن التنظيم ليس أن تملأ يومك، بل أن تترك مساحة لما يهمك حقاً. صممنا نورة لتكون هادئة، مرنة، وقريبة منك.</p><Link href="/signup" className="inline-link">ابدأ رحلتك <ArrowUpLeft size={16} /></Link></div>
          </div>
        </section>

        <section id="rhythm" className="rhythm-section">
          <div className="shell rhythm-grid">
            <div className="rhythm-intro"><div className="section-label light-label"><span>02</span><span>إيقاعك الخاص</span></div><h2>أقل ضجيجاً.<br /><em>أكثر حضوراً.</em></h2><p>ثلاثة أشياء بسيطة تجعل كل يوم أخف.</p></div>
            <div className="benefits-list">{benefits.map((benefit, index) => <div className="benefit" key={benefit}><span className="benefit-number">0{index + 1}</span><span>{benefit}</span><Check size={17} /></div>)}</div>
          </div>
        </section>

        <section id="contact" className="final-cta shell"><div><div className="eyebrow"><Sparkles size={14} /> البداية من هنا</div><h2>جاهز لمساحة<br /><em>تشبهك؟</em></h2></div><Link href="/signup" className="button button-accent button-large">إنشاء حساب مجاني <ArrowUpLeft size={18} /></Link></section>
      </main>
      <footer className="site-footer shell"><Logo /><p>نصنع مساحات أهدأ للأفكار الجميلة.</p><div className="footer-social"><a href="#contact" aria-label="Instagram"><Instagram size={17} /></a><a href="#contact" aria-label="Twitter"><Twitter size={17} /></a></div><span className="copyright">© 2026 noura</span></footer>
      <BottomNav />
    </div>
  );
}

function AuthShell({ children, title, description, mode }: { children: React.ReactNode; title: string; description: string; mode: "login" | "signup" }) {
  const [, setLocation] = useLocation();
  return (
    <div className="auth-page" dir="rtl">
      <div className="auth-aside"><div className="auth-aside-top"><Logo light /><Link href="/" className="back-home"><ArrowLeft size={16} /> العودة للرئيسية</Link></div><div className="auth-aside-content"><div className="eyebrow eyebrow-light"><Sparkles size={14} /> مساحة أهدأ. يوم أوضح.</div><h1>ابدأ من المكان<br /><em>الذي يشبهك.</em></h1><p>خطوة صغيرة اليوم، ومساحة أوسع لأفكارك غداً.</p><div className="aside-stamp"><span>ن</span><div><strong>noura</strong><small>your softer space</small></div></div></div><div className="auth-aside-footer">تصميم يترك مجالاً لما يهمك حقاً <span>✦</span></div></div>
      <main className="auth-main"><div className="auth-card"><div className="mobile-auth-logo"><Logo /></div><div className="auth-heading"><span className="auth-kicker">{mode === "login" ? "مرحباً بعودتك" : "أهلاً بك في نورة"}</span><h2>{title}</h2><p>{description}</p></div>{children}<div className="auth-switch">{mode === "login" ? <>ليس لديك حساب؟ <Link href="/signup">أنشئ حساباً مجانياً</Link></> : <>لديك حساب بالفعل؟ <Link href="/login">تسجيل الدخول</Link></>}</div><button className="back-link" onClick={() => setLocation("/")}><ArrowLeft size={15} /> العودة للصفحة الرئيسية</button></div></main>
      <BottomNav />
    </div>
  );
}

function PasswordField({ label, id, value, onChange, placeholder }: { label: string; id: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="field"><span>{label}</span><div className="input-wrap"><LockKeyhole size={17} /><input id={id} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required /><button type="button" className="input-action" onClick={() => setVisible(!visible)} aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>;
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
  return <AuthShell mode="login" title="تسجيل الدخول" description="أدخل بياناتك للعودة إلى مساحتك."><form className="auth-form" onSubmit={submit}><label className="field"><span>البريد الإلكتروني</span><div className="input-wrap"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" dir="ltr" required /></div></label><PasswordField label="كلمة المرور" id="login-password" value={password} onChange={setPassword} placeholder="••••••••" /><div className="form-row"><label className="check-label"><input type="checkbox" /> <span>تذكرني</span></label><a href="#forgot" onClick={(event) => { event.preventDefault(); toast.info("سنرسل لك رابط استعادة كلمة المرور قريباً."); }}>نسيت كلمة المرور؟</a></div><button className="button button-dark submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "جارٍ تسجيل الدخول…" : <>تسجيل الدخول <ArrowUpLeft size={17} /></>}</button></form><div className="auth-divider"><span>أو تابع باستخدام</span></div><button type="button" className="social-button" onClick={() => toast.info("تسجيل الدخول بواسطة Google سيكون متاحاً قريباً.")}><span className="google-mark">G</span> المتابعة باستخدام Google</button></AuthShell>;
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
        emailRedirectTo: `${window.location.origin}/login`,
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
      toast.success("تم إنشاء حسابك", { description: "تحقق من بريدك الإلكتروني لتفعيل الحساب." });
    }
  };
  return <AuthShell mode="signup" title="إنشاء حساب" description="أنشئ مساحتك المجانية في أقل من دقيقة."><form className="auth-form" onSubmit={submit}><label className="field"><span>الاسم الكامل</span><div className="input-wrap"><UserRound size={17} /><input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="مثلاً: نور أحمد" required /></div></label><label className="field"><span>البريد الإلكتروني</span><div className="input-wrap"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" dir="ltr" required /></div></label><PasswordField label="كلمة المرور" id="signup-password" value={password} onChange={setPassword} placeholder="8 أحرف على الأقل" /><label className="check-label terms"><input type="checkbox" required /> <span>أوافق على <a href="#terms">الشروط والأحكام</a> وسياسة الخصوصية.</span></label><button className="button button-accent submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "جارٍ إنشاء الحساب…" : <>إنشاء حساب مجاني <ArrowUpLeft size={17} /></>}</button></form><div className="auth-divider"><span>أو تابع باستخدام</span></div><button type="button" className="social-button" onClick={() => toast.info("التسجيل بواسطة Google سيكون متاحاً قريباً.")}><span className="google-mark">G</span> التسجيل باستخدام Google</button></AuthShell>;
}
