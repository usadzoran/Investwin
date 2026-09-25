import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Home,
  LogOut,
  RefreshCw,
  Send,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  type ChainKey,
  type Eip1193Provider,
  type WalletSource,
  connectWallet,
  getWalletSnapshot,
  sendUsdt,
  SUPPORTED_CHAINS,
  switchToChain,
} from "@/lib/wallet";

const chainKeys = Object.keys(SUPPORTED_CHAINS) as ChainKey[];

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function WalletLogo() {
  return <Link href="/" className="wallet-brand"><span className="wallet-brand-dot" />noura</Link>;
}

function copyText(value: string, label: string) {
  navigator.clipboard.writeText(value).then(() => toast.success(`تم نسخ ${label}`));
}

export default function WalletPage() {
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [source, setSource] = useState<WalletSource | null>(null);
  const [address, setAddress] = useState("");
  const [activeChain, setActiveChain] = useState<ChainKey>("ethereum");
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof getWalletSnapshot>> | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [activePanel, setActivePanel] = useState<"receive" | "send">("receive");

  const chain = SUPPORTED_CHAINS[activeChain];
  const isWrongNetwork = Boolean(snapshot?.wrongNetwork);
  const displayBalance = snapshot?.usdtBalance === "—" ? "—" : Number(snapshot?.usdtBalance ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 });

  const refresh = useCallback(async (nextProvider = provider, nextChain = activeChain) => {
    if (!nextProvider) return;
    setIsRefreshing(true);
    try {
      const nextSnapshot = await getWalletSnapshot(nextProvider, nextChain);
      setSnapshot(nextSnapshot);
      setAddress(nextSnapshot.address);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر قراءة رصيد المحفظة.");
    } finally {
      setIsRefreshing(false);
    }
  }, [activeChain, provider]);

  useEffect(() => {
    if (!provider) return;
    const handleAccounts = (accounts: string[]) => {
      if (!accounts[0]) {
        setProvider(null);
        setSource(null);
        setAddress("");
        setSnapshot(null);
        return;
      }
      setAddress(accounts[0]);
      void refresh(provider, activeChain);
    };
    const handleChain = () => void refresh(provider, activeChain);
    provider.on?.("accountsChanged", handleAccounts);
    provider.on?.("chainChanged", handleChain);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccounts);
      provider.removeListener?.("chainChanged", handleChain);
    };
  }, [activeChain, provider, refresh]);

  useEffect(() => {
    if (provider) void refresh(provider, activeChain);
  }, [activeChain, provider, refresh]);

  const connect = async (nextSource: WalletSource) => {
    setIsConnecting(true);
    try {
      const nextProvider = await connectWallet(nextSource);
      setProvider(nextProvider);
      setSource(nextSource);
      await refresh(nextProvider, activeChain);
      toast.success("تم ربط المحفظة بنجاح");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر ربط المحفظة.");
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    await provider?.disconnect?.();
    setProvider(null);
    setSource(null);
    setAddress("");
    setSnapshot(null);
    toast.success("تم فصل المحفظة");
  };

  const changeChain = async (nextChain: ChainKey) => {
    setActiveChain(nextChain);
    if (!provider) return;
    try {
      await switchToChain(provider, nextChain);
      await refresh(provider, nextChain);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "لم نتمكن من تغيير الشبكة.");
    }
  };

  const submitTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!provider) {
      toast.error("اربط محفظتك أولاً.");
      return;
    }
    if (!recipient.match(/^0x[a-fA-F0-9]{40}$/)) {
      toast.error("أدخل عنوان EVM صحيحاً يبدأ بـ 0x.");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error("أدخل كمية USDT صحيحة.");
      return;
    }
    if (isWrongNetwork) {
      toast.error(`حوّل المحفظة إلى شبكة ${chain.name} أولاً.`);
      return;
    }

    setIsSending(true);
    try {
      const receipt = await sendUsdt(provider, activeChain, recipient, amount);
      toast.success("تم تأكيد إرسال USDT", { description: `المعاملة: ${receipt?.hash?.slice(0, 16)}…` });
      setRecipient("");
      setAmount("");
      await refresh(provider, activeChain);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تم رفض المعاملة أو تعذر إرسالها.");
    } finally {
      setIsSending(false);
    }
  };

  const connectionLabel = useMemo(() => source === "walletconnect" ? "WalletConnect" : "MetaMask", [source]);

  return (
    <div className="wallet-page" dir="rtl">
      <header className="wallet-header">
        <WalletLogo />
        <Link href="/" className="wallet-home-link"><Home size={16} /> الرئيسية</Link>
      </header>
      <main className="wallet-shell">
        <div className="wallet-heading-row">
          <div><div className="wallet-eyebrow"><ShieldCheck size={14} /> محفظتك غير الوصائية</div><h1>أرسل واستقبل <em>USDT.</em></h1><p>أموالك تبقى تحت سيطرتك. كل معاملة تحتاج موافقتك داخل المحفظة.</p></div>
          {provider && <button className="wallet-disconnect" onClick={disconnect}><LogOut size={15} /> فصل {connectionLabel}</button>}
        </div>

        {!provider ? (
          <section className="wallet-connect-card">
            <div className="wallet-card-icon"><WalletCards size={25} /></div>
            <div><h2>اربط محفظتك للبدء</h2><p>لا نطلب أبداً العبارة السرية أو المفتاح الخاص.</p></div>
            <div className="wallet-connect-actions"><button className="wallet-connect-button wallet-connect-metamask" disabled={isConnecting} onClick={() => void connect("metamask")}>🦊 <span>{isConnecting ? "جارٍ الربط…" : "MetaMask"}</span></button><button className="wallet-connect-button" disabled={isConnecting} onClick={() => void connect("walletconnect")}>⌁ <span>WalletConnect</span></button></div>
            <div className="wallet-safety-note"><ShieldCheck size={15} /> الاتصال غير وصائي — لا نملك صلاحية نقل أموالك.</div>
          </section>
        ) : (
          <>
            <section className="wallet-overview-card">
              <div className="wallet-overview-top"><span className="connected-pill"><span /> متصل الآن</span><button className="refresh-button" onClick={() => void refresh()} aria-label="تحديث الرصيد"><RefreshCw size={16} className={isRefreshing ? "spin" : ""} /></button></div>
              <div className="wallet-address-row"><div><small>العنوان المتصل · {connectionLabel}</small><strong>{shortenAddress(address)}</strong></div><button onClick={() => copyText(address, "العنوان")} aria-label="نسخ العنوان"><Copy size={16} /></button></div>
              <div className="wallet-network-row"><label>الشبكة</label><div className="chain-select-wrap"><select value={activeChain} onChange={(event) => void changeChain(event.target.value as ChainKey)}>{chainKeys.map((key) => <option value={key} key={key}>{SUPPORTED_CHAINS[key].name}</option>)}</select><ChevronDown size={15} /></div></div>
              {isWrongNetwork && <div className="wrong-network"><span>المحفظة على شبكة مختلفة.</span><button onClick={() => void changeChain(activeChain)}>التبديل إلى {chain.name}</button></div>}
              <div className="wallet-balance"><small>رصيد USDT على {chain.name}</small><strong>{displayBalance} <span>USDT</span></strong><div className="native-balance">الرصيد الأصلي: {snapshot?.nativeBalance ?? "—"} {chain.symbol}</div></div>
            </section>

            <section className="wallet-actions-card">
              <div className="wallet-tabs"><button className={activePanel === "receive" ? "active" : ""} onClick={() => setActivePanel("receive")}><ArrowDownToLine size={17} /> استقبال</button><button className={activePanel === "send" ? "active" : ""} onClick={() => setActivePanel("send")}><Send size={16} /> إرسال</button></div>
              {activePanel === "receive" ? <div className="receive-panel"><div><h2>استقبال USDT</h2><p>أرسل USDT إلى هذا العنوان باستخدام شبكة <strong>{chain.name}</strong> فقط.</p></div><div className="receive-address"><code>{address}</code><button onClick={() => copyText(address, "عنوان الاستقبال")}><Copy size={16} /> نسخ</button></div><div className="network-warning"><ShieldCheck size={15} /><span>تأكد من اختيار الشبكة نفسها في المنصة المرسلة. العملات المرسلة على شبكة مختلفة قد تضيع.</span></div><div className="binance-deposit-card"><div className="binance-deposit-heading"><span className="binance-mark">B</span><div><strong>الإيداع من Binance</strong><small>أرسل يدوياً إلى محفظتك بأمان</small></div></div><ol><li>في Binance اختر <b>Withdraw USDT</b>.</li><li>ألصق العنوان أعلاه واختر شبكة <b>{chain.name}</b>.</li><li>راجع الشبكة والعنوان ثم أكمل السحب من Binance.</li></ol><a className="binance-open-link" href="https://www.binance.com/en/my/wallet/account/main" target="_blank" rel="noreferrer">فتح Binance <ExternalLink size={14} /></a></div><a className="explorer-link" href={`${chain.explorer}/address/${address}`} target="_blank" rel="noreferrer">عرض العنوان على المستكشف <ExternalLink size={14} /></a></div> : <form className="send-panel" onSubmit={submitTransfer}><div><h2>إرسال USDT</h2><p>ستراجع وتوقع المعاملة داخل {connectionLabel} قبل الإرسال.</p></div><label>عنوان المستلم<input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" dir="ltr" /></label><label>الكمية<input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" inputMode="decimal" dir="ltr" /><span className="input-unit">USDT</span></label><button className="wallet-send-button" type="submit" disabled={isSending || isWrongNetwork}>{isSending ? "بانتظار تأكيدك…" : <>مراجعة وإرسال <ArrowUpLeft size={17} /></>}</button><div className="network-warning"><ShieldCheck size={15} /><span>لا يمكن التراجع عن المعاملة بعد تأكيدها. تحقق من العنوان والشبكة قبل التوقيع.</span></div></form>}
            </section>
          </>
        )}
        <div className="wallet-back-links"><Link href="/"><ArrowLeft size={15} /> العودة إلى الصفحة الرئيسية</Link><span>نورة لا تطلب منك أبداً مفتاحك الخاص أو عبارة الاسترداد.</span></div>
      </main>
      <nav className="wallet-bottom-nav"><Link href="/"><Home size={16} /><span>الرئيسية</span></Link><Link href="/wallet" className="active"><WalletCards size={16} /><span>المحفظة</span></Link><Link href="/login"><ArrowUpRight size={16} /><span>الحساب</span></Link></nav>
    </div>
  );
}
