import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Clock3,
  Coins,
  Copy,
  ExternalLink,
  Home,
  LogOut,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  WalletCards,
  Zap,
} from "lucide-react";
import {
  type ChainKey,
  type Eip1193Provider,
  type WalletSource,
  connectWallet,
  getWalletSnapshot,
  getWalletErrorMessage,
  sendUsdt,
  SUPPORTED_CHAINS,
  switchToChain,
} from "@/lib/wallet";
import {
  createUserDeposit,
  getCurrentUser,
  loadUserDeposits,
  recordUserTransfer,
  syncUserWallet,
  updateUserDeposit,
  type DepositRecord,
  type InvestmentPlan,
  loadUserInvestments,
  createInvestmentPlan,
  getPlanEarningsInfo,
  claimInvestmentProfits,
  withdrawPlanPrincipal,
  saveUserInvestments,
} from "@/lib/walletData";

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

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00 (جاهز للتوزيع)";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function WalletPage() {
  const [, navigate] = useLocation();
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
  const [activePanel, setActivePanel] = useState<"invest" | "receive" | "send">("invest");
  const [depositHash, setDepositHash] = useState("");
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [isCheckingDeposit, setIsCheckingDeposit] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>();

  // Investment State
  const [investAmount, setInvestAmount] = useState<string>("10");
  const [durationDays, setDurationDays] = useState<number>(7);
  const [investments, setInvestments] = useState<InvestmentPlan[]>([]);
  const [isStartingPlan, setIsStartingPlan] = useState(false);
  const [, setTick] = useState<number>(0);

  const chain = SUPPORTED_CHAINS[activeChain];
  const isWrongNetwork = Boolean(snapshot?.wrongNetwork);
  const displayBalance = snapshot?.usdtBalance === "—" ? "—" : Number(snapshot?.usdtBalance ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 });

  // Real-time calculation based on user input
  const numInvest = Math.max(1, Number(investAmount) || 0);
  // 20% profit every 24 hours: 5$ -> 1$, 10$ -> 2$
  const dailyProfit = +(numInvest * 0.20).toFixed(2);
  const totalPeriodProfit = +(dailyProfit * durationDays).toFixed(2);
  const totalReturn = +(numInvest + totalPeriodProfit).toFixed(2);

  // Live timer tick every second for countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getCurrentUser().then(async (user) => {
      if (cancelled) return;
      setUserId(user.id);
      setUserEmail(user.email);
      setInvestments(loadUserInvestments(user.id));
      try {
        setDeposits(await loadUserDeposits(user.id));
      } catch (error) {
        toast.error(getWalletErrorMessage(error, "تعذر تحميل بيانات المحفظة من قاعدة البيانات."));
      }
    }).catch(() => {
      toast.error("سجّل الدخول أولاً لمزامنة محفظتك مع قاعدة البيانات.");
      navigate("/login");
    });
    return () => { cancelled = true; };
  }, [navigate]);

  const handleStartInvestment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) {
      toast.error("يرجى تسجيل الدخول أولاً.");
      return;
    }
    if (numInvest <= 0) {
      toast.error("يرجى إدخال مبلغ استثمار صحيح.");
      return;
    }

    setIsStartingPlan(true);
    try {
      const plan = createInvestmentPlan({
        userId,
        walletAddress: address || "0x_vault_account",
        amount: numInvest,
        durationDays,
      });

      const updated = [plan, ...investments.filter((p) => p.id !== plan.id)];
      setInvestments(updated);

      toast.success("تم بدء خطة الاستثمار بنجاح!", {
        description: `تم إيداع ${numInvest}$ بنجاح. ستحصل على ${dailyProfit}$ كل 24 ساعة لمدة ${durationDays} أيام.`,
      });
    } catch {
      toast.error("حدث خطأ أثناء بدء خطة الاستثمار.");
    } finally {
      setIsStartingPlan(false);
    }
  };

  const handleClaimProfit = (planId: string) => {
    if (!userId) return;
    try {
      const result = claimInvestmentProfits(userId, planId);
      setInvestments((prev) => prev.map((p) => (p.id === planId ? result.plan : p)));
      toast.success(`تم سحب ${result.claimed}$ أرباح بنجاح إلى رصيدك!`, {
        description: "تم تحويل أرباح الـ 24 ساعة إلى محفظتك مباشرة.",
      });
    } catch (e: any) {
      toast.error(e?.message || "تعذر سحب الأرباح حالياً.");
    }
  };

  const handleWithdrawPrincipal = (planId: string) => {
    if (!userId) return;
    try {
      const updated = withdrawPlanPrincipal(userId, planId);
      setInvestments((prev) => prev.map((p) => (p.id === planId ? updated : p)));
      toast.success("تم استرداد رأس المال بالكامل بنجاح!");
    } catch {
      toast.error("تعذر استرداد رأس المال.");
    }
  };

  // Helper for immediate 24h simulation (for demo / testing payout without waiting 24 real hours)
  const handleSimulate24Hours = (planId: string) => {
    if (!userId) return;
    const plans = loadUserInvestments(userId);
    const index = plans.findIndex((p) => p.id === planId);
    if (index === -1) return;

    // Fast-forward lastClaimAt by 24 hours
    const plan = plans[index];
    const msInDay = 24 * 60 * 60 * 1000 + 1000;
    const adjustedStart = new Date(new Date(plan.startedAt).getTime() - msInDay).toISOString();
    const adjustedLastClaim = new Date(new Date(plan.lastClaimAt).getTime() - msInDay).toISOString();

    const updatedPlan: InvestmentPlan = {
      ...plan,
      startedAt: adjustedStart,
      lastClaimAt: adjustedLastClaim,
    };

    plans[index] = updatedPlan;
    saveUserInvestments(userId, plans);
    setInvestments([...plans]);

    toast.info("تمت محاكاة انقضاء دورة 24 ساعة!", {
      description: `أصبحت أرباح بقيمة ${plan.dailyProfit}$ جاهزة للسحب الآن.`,
    });
  };

  const saveDeposits = (next: DepositRecord[]) => setDeposits(next);

  const checkDepositHash = async (hash: string) => {
    if (!provider) throw new Error("اربط محفظتك أولاً.");
    const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [hash] }) as { status?: string } | null;
    return receipt ? (receipt.status === "0x1" ? "completed" : "failed") : "pending";
  };

  const addDeposit = async (event: React.FormEvent) => {
    event.preventDefault();
    const hash = depositHash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      toast.error("أدخل Transaction Hash صحيحاً يبدأ بـ 0x.");
      return;
    }
    if (deposits.some((deposit) => deposit.hash.toLowerCase() === hash.toLowerCase() && deposit.chain === activeChain)) {
      toast.error("هذه المعاملة موجودة في السجل بالفعل.");
      return;
    }
    setIsCheckingDeposit(true);
    try {
      const status = await checkDepositHash(hash);
      if (!userId || !address) throw new Error("لم يتم التعرف على حساب المستخدم.");
      const created = await createUserDeposit({ userId, walletAddress: address, chain: activeChain, hash, status });
      saveDeposits([created, ...deposits]);
      setDepositHash("");
      toast.success(status === "completed" ? "المعاملة مكتملة على الشبكة" : "تمت إضافة المعاملة قيد المراجعة");
    } catch (error) {
      toast.error(getWalletErrorMessage(error, "تعذر التحقق من المعاملة."));
    } finally {
      setIsCheckingDeposit(false);
    }
  };

  const refreshDeposit = async (deposit: DepositRecord) => {
    if (!provider) return;
    try {
      const status = await checkDepositHash(deposit.hash);
      await updateUserDeposit(deposit.id, status);
      saveDeposits(deposits.map((item) => item.id === deposit.id ? { ...item, status } : item));
    } catch {
      toast.error("تعذر تحديث حالة المعاملة.");
    }
  };

  const refresh = useCallback(async (nextProvider = provider, nextChain = activeChain) => {
    if (!nextProvider) return;
    setIsRefreshing(true);
    try {
      const nextSnapshot = await getWalletSnapshot(nextProvider, nextChain);
      setSnapshot(nextSnapshot);
      setAddress(nextSnapshot.address);
    } catch (error) {
      toast.error(getWalletErrorMessage(error, "تعذر قراءة رصيد المحفظة."));
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
      const connectedAccounts = await nextProvider.request({ method: "eth_accounts" }) as string[];
      if (userId && connectedAccounts[0]) await syncUserWallet(userId, userEmail, connectedAccounts[0], activeChain);
      toast.success("تم ربط المحفظة بنجاح");
    } catch (error) {
      toast.error(getWalletErrorMessage(error, "تعذر ربط المحفظة."));
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      await provider?.disconnect?.();
      toast.success("تم فصل المحفظة");
    } catch (error) {
      toast.error(getWalletErrorMessage(error, "تعذر فصل المحفظة، حاول مرة أخرى."));
    } finally {
      setProvider(null);
      setSource(null);
      setAddress("");
      setSnapshot(null);
    }
  };

  const changeChain = async (nextChain: ChainKey) => {
    setActiveChain(nextChain);
    if (!provider) return;
    try {
      await switchToChain(provider, nextChain);
      await refresh(provider, nextChain);
      if (userId && address) await syncUserWallet(userId, userEmail, address, nextChain);
    } catch (error) {
      toast.error(getWalletErrorMessage(error, "لم نتمكن من تغيير الشبكة."));
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
      if (userId && address && receipt?.hash) {
        await recordUserTransfer({ userId, fromAddress: address, toAddress: recipient, chain: activeChain, amount, txHash: receipt.hash });
      }
      toast.success("تم تأكيد إرسال USDT", { description: `المعاملة: ${receipt?.hash?.slice(0, 16)}…` });
      setRecipient("");
      setAmount("");
      await refresh(provider, activeChain);
    } catch (error) {
      toast.error(getWalletErrorMessage(error, "تم رفض المعاملة أو تعذر إرسالها."));
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
              <div className="wallet-tabs" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <button
                  className={activePanel === "invest" ? "active" : ""}
                  onClick={() => setActivePanel("invest")}
                >
                  <TrendingUp size={16} /> الاستثمار والعائد اليومي
                </button>
                <button
                  className={activePanel === "receive" ? "active" : ""}
                  onClick={() => setActivePanel("receive")}
                >
                  <ArrowDownToLine size={16} /> استقبال
                </button>
                <button
                  className={activePanel === "send" ? "active" : ""}
                  onClick={() => setActivePanel("send")}
                >
                  <Send size={16} /> إرسال
                </button>
              </div>

              {activePanel === "invest" && (
                <div className="invest-panel">
                  <div>
                    <h2>استثمر واحصل على عوائد كل 24 ساعة</h2>
                    <p>
                      استثمر في محفظة المنصة لمدة أسبوع أو أكثر، واحصل تلقائياً كل 24 ساعة على نسبة ربح ثابتة (20% يومياً).
                    </p>
                    <div className="invest-badge-row">
                      <span className="invest-pill green">
                        <Sparkles size={13} /> استثمار 5$ = ربح 1$ كل 24 ساعة
                      </span>
                      <span className="invest-pill gold">
                        <Zap size={13} /> استثمار 10$ = ربح 2$ كل 24 ساعة
                      </span>
                      <span className="invest-pill blue">
                        <Clock size={13} /> توزيع تلقائي كل 24 ساعة
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleStartInvestment} style={{ display: "grid", gap: "18px" }}>
                    {/* Custom Investment Amount Input */}
                    <div className="invest-input-section">
                      <label htmlFor="invest-amount-input">
                        حدد المبلغ الذي تريد استثماره (USDT / دولار):
                      </label>
                      <div className="invest-input-wrap">
                        <span className="invest-input-prefix">$</span>
                        <input
                          id="invest-amount-input"
                          className="invest-input-field"
                          type="number"
                          min="1"
                          step="any"
                          value={investAmount}
                          onChange={(e) => setInvestAmount(e.target.value)}
                          placeholder="مثلاً: 5 أو 10"
                          required
                        />
                        <span className="invest-input-suffix">USDT</span>
                      </div>

                      {/* Quick Selection Chips */}
                      <div className="invest-chips-list">
                        {[
                          { val: "5", label: "$5 (1$ يومياً)" },
                          { val: "10", label: "$10 (2$ يومياً)" },
                          { val: "25", label: "$25 (5$ يومياً)" },
                          { val: "50", label: "$50 (10$ يومياً)" },
                          { val: "100", label: "$100 (20$ يومياً)" },
                        ].map((chip) => (
                          <button
                            type="button"
                            key={chip.val}
                            className={`invest-chip-btn ${investAmount === chip.val ? "active" : ""}`}
                            onClick={() => setInvestAmount(chip.val)}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration Selection (1 week or more) */}
                    <div className="invest-input-section">
                      <label>مدة قفل الاستثمار (أسبوع أو أكثر):</label>
                      <div className="duration-selector-row">
                        {[
                          { days: 7, label: "أسبوع واحد", sub: "7 أيام (الأساسية)" },
                          { days: 14, label: "أسبوعان", sub: "14 يوماً (مضاعفة)" },
                          { days: 30, label: "شهر كامل", sub: "30 يوماً (أقصى نمو)" },
                        ].map((d) => (
                          <button
                            type="button"
                            key={d.days}
                            className={`duration-btn ${durationDays === d.days ? "active" : ""}`}
                            onClick={() => setDurationDays(d.days)}
                          >
                            <strong>{d.label}</strong>
                            <small>{d.sub}</small>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Live Financial Breakdown Card */}
                    <div className="invest-summary-card">
                      <div className="summary-line">
                        <span>المبلغ المستثمر:</span>
                        <strong>${numInvest.toFixed(2)} USDT</strong>
                      </div>
                      <div className="summary-line">
                        <span>الربح المستحق كل 24 ساعة (20% يومياً):</span>
                        <strong style={{ color: "#059669" }}>+${dailyProfit.toFixed(2)} USDT</strong>
                      </div>
                      <div className="summary-line">
                        <span>مدة الاستثمار المقررة:</span>
                        <strong>{durationDays} أيام ({durationDays >= 7 ? `${durationDays / 7} أسابيع` : ""})</strong>
                      </div>
                      <div className="summary-line">
                        <span>إجمالي الأرباح الصافية المتوقعة:</span>
                        <strong style={{ color: "#d97706" }}>+${totalPeriodProfit.toFixed(2)} USDT</strong>
                      </div>
                      <div className="summary-line highlight">
                        <span>إجمالي العائد الكلي (رأس المال + الأرباح):</span>
                        <strong>${totalReturn.toFixed(2)} USDT</strong>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="invest-cta-button"
                      disabled={isStartingPlan || numInvest <= 0}
                    >
                      <Sparkles size={18} />
                      {isStartingPlan ? "جارٍ تفعيل الخطة…" : `تأكيد وبدء استثمار $${numInvest} (ربح $${dailyProfit} كل 24 ساعة)`}
                    </button>
                  </form>
                </div>
              )}

              {activePanel === "receive" && (
                <div className="receive-panel">
                  <div>
                    <h2>استقبال USDT</h2>
                    <p>أرسل USDT إلى هذا العنوان باستخدام شبكة <strong>{chain.name}</strong> فقط.</p>
                  </div>
                  <div className="receive-address">
                    <code>{address}</code>
                    <button onClick={() => copyText(address, "عنوان الاستقبال")}><Copy size={16} /> نسخ</button>
                  </div>
                  <div className="network-warning">
                    <ShieldCheck size={15} />
                    <span>تأكد من اختيار الشبكة نفسها في المنصة المرسلة. العملات المرسلة على شبكة مختلفة قد تضيع.</span>
                  </div>
                  <div className="binance-deposit-card">
                    <div className="binance-deposit-heading">
                      <span className="binance-mark">B</span>
                      <div>
                        <strong>الإيداع من Binance</strong>
                        <small>أرسل يدوياً إلى محفظتك بأمان</small>
                      </div>
                    </div>
                    <ol>
                      <li>في Binance اختر <b>Withdraw USDT</b>.</li>
                      <li>ألصق العنوان أعلاه واختر شبكة <b>{chain.name}</b>.</li>
                      <li>راجع الشبكة والعنوان ثم أكمل السحب من Binance.</li>
                    </ol>
                    <a className="binance-open-link" href="https://www.binance.com/en/my/wallet/account/main" target="_blank" rel="noreferrer">
                      فتح Binance <ExternalLink size={14} />
                    </a>
                  </div>
                  <a className="explorer-link" href={`${chain.explorer}/address/${address}`} target="_blank" rel="noreferrer">
                    عرض العنوان على المستكشف <ExternalLink size={14} />
                  </a>
                </div>
              )}

              {activePanel === "send" && (
                <form className="send-panel" onSubmit={submitTransfer}>
                  <div>
                    <h2>إرسال USDT</h2>
                    <p>ستراجع وتوقع المعاملة داخل {connectionLabel} قبل الإرسال.</p>
                  </div>
                  <label>
                    عنوان المستلم
                    <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" dir="ltr" />
                  </label>
                  <label>
                    الكمية
                    <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" inputMode="decimal" dir="ltr" />
                    <span className="input-unit">USDT</span>
                  </label>
                  <button className="wallet-send-button" type="submit" disabled={isSending || isWrongNetwork}>
                    {isSending ? "بانتظار تأكيدك…" : <>مراجعة وإرسال <ArrowUpLeft size={17} /></>}
                  </button>
                  <div className="network-warning">
                    <ShieldCheck size={15} />
                    <span>لا يمكن التراجع عن المعاملة بعد تأكيدها. تحقق من العنوان والشبكة قبل التوقيع.</span>
                  </div>
                </form>
              )}
            </section>

            {/* Active Investments Section */}
            <section className="active-plans-card">
              <div className="active-plans-heading">
                <div>
                  <h3>استثماراتي النشطة وتوزيع الأرباح</h3>
                  <small style={{ color: "var(--muted)", fontSize: "12px" }}>
                    متابعة خطط الاستثمار النشطة، عداد الـ 24 ساعة، وسحب الأرباح فورياً.
                  </small>
                </div>
                <span className="deposit-count">{investments.length} خطط</span>
              </div>

              {investments.length === 0 ? (
                <div className="deposit-empty">
                  <Coins size={20} />
                  <span>لا توجد استثمارات نشطة حالياً. حدد المبلغ أعلاه وابدأ خطتك الأولى.</span>
                </div>
              ) : (
                <div>
                  {investments.map((plan) => {
                    const info = getPlanEarningsInfo(plan);
                    return (
                      <div className="active-plan-item" key={plan.id}>
                        <div className="active-plan-top">
                          <div>
                            <span className="plan-amount-badge">${plan.amount.toFixed(2)} USDT</span>
                            <span style={{ fontSize: "11px", color: "var(--muted)", marginRight: "8px" }}>
                              (لمدة {plan.durationDays} أيام)
                            </span>
                          </div>
                          <span className="plan-rate-tag">
                            +${plan.dailyProfit.toFixed(2)} كل 24 ساعة
                          </span>
                        </div>

                        {/* Real-time 24h Countdown */}
                        <div className="countdown-box">
                          <span className="countdown-label">
                            <Clock3 size={15} style={{ color: "#d97706" }} /> موعد توزيع الدفعة القادمة:
                          </span>
                          <span className="countdown-digits">
                            {formatCountdown(info.msUntilNextCycle)}
                          </span>
                        </div>

                        {/* Profit and Actions */}
                        <div className="plan-earnings-row">
                          <div>
                            <span style={{ fontSize: "11px", color: "var(--muted)" }}>الأرباح الجاهزة للسحب الآن: </span>
                            <strong>${info.claimableProfit.toFixed(2)} USDT</strong>
                          </div>
                          <button
                            type="button"
                            className="claim-btn"
                            disabled={info.claimableProfit <= 0}
                            onClick={() => handleClaimProfit(plan.id)}
                          >
                            <Coins size={14} />
                            سحب الأرباح (${info.claimableProfit.toFixed(2)})
                          </button>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", borderTop: "1px dashed #e2e8f0", paddingTop: "10px" }}>
                          <span style={{ fontSize: "11px", color: "#64748b" }}>
                            إجمالي الأرباح المستلمة: <b>${plan.claimedProfits.toFixed(2)}</b> من <b>${info.maxTotalProfit.toFixed(2)}</b>
                          </span>

                          <div style={{ display: "flex", gap: "8px" }}>
                            {/* Fast forward 24h simulator for immediate testing */}
                            <button
                              type="button"
                              className="simulate-btn"
                              onClick={() => handleSimulate24Hours(plan.id)}
                              title="تسريع مرور 24 ساعة لتجربة سحب الأرباح فوراً"
                            >
                              ⚡ محاكاة مرور 24 ساعة (تجربة فورية)
                            </button>

                            {info.isCompleted && plan.status !== "withdrawn" && (
                              <button
                                type="button"
                                className="button button-small button-outline"
                                onClick={() => handleWithdrawPrincipal(plan.id)}
                              >
                                استرداد رأس المال (${plan.amount})
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="deposit-history-card">
              <div className="deposit-history-heading"><div><div className="wallet-eyebrow"><Clock3 size={14} /> متابعة الإيداعات</div><h2>سجل الإيداعات</h2><p>أضف Transaction Hash من Binance لمتابعة حالة المعاملة على الشبكة.</p></div><span className="deposit-count">{deposits.length} معاملات</span></div>
              <form className="deposit-check-form" onSubmit={addDeposit}><input value={depositHash} onChange={(event) => setDepositHash(event.target.value)} placeholder="ألصق Transaction Hash هنا" dir="ltr" /><button type="submit" disabled={isCheckingDeposit}>{isCheckingDeposit ? "جارٍ التحقق…" : "إضافة للسجل"}</button></form>
              {deposits.length === 0 ? <div className="deposit-empty"><Clock3 size={18} /><span>لا توجد إيداعات مسجلة بعد.</span></div> : <div className="deposit-list">{deposits.map((deposit) => { const depositChain = SUPPORTED_CHAINS[deposit.chain]; const statusLabel = deposit.status === "completed" ? "مكتملة" : deposit.status === "failed" ? "فاشلة" : "قيد المراجعة"; return <div className="deposit-row" key={`${deposit.chain}-${deposit.hash}`}><div className={`deposit-status-icon ${deposit.status}`}>{deposit.status === "completed" ? <CircleCheck size={17} /> : deposit.status === "failed" ? <TriangleAlert size={17} /> : <Clock3 size={17} />}</div><div className="deposit-meta"><strong>{statusLabel}</strong><small>{depositChain.name} · {shortenAddress(deposit.hash)}</small></div><a href={`${depositChain.explorer}/tx/${deposit.hash}`} target="_blank" rel="noreferrer" aria-label="عرض المعاملة"><ExternalLink size={15} /></a>{deposit.status === "pending" && <button className="deposit-refresh" onClick={() => void refreshDeposit(deposit)} aria-label="تحديث الحالة"><RefreshCw size={14} /></button>}</div>; })}</div>}
              <div className="deposit-history-note"><ShieldCheck size={14} /> الحالة تعكس تأكيد المعاملة على الشبكة، ولا تعني ضمان وصول الأموال إذا كانت الشبكة أو العنوان غير صحيحين.</div>
            </section>
          </>
        )}
        <div className="wallet-back-links"><Link href="/"><ArrowLeft size={15} /> العودة إلى الصفحة الرئيسية</Link><span>نورة لا تطلب منك أبداً مفتاحك الخاص أو عبارة الاسترداد.</span></div>
      </main>
      <nav className="wallet-bottom-nav"><Link href="/"><Home size={16} /><span>الرئيسية</span></Link><Link href="/wallet" className="active"><WalletCards size={16} /><span>المحفظة</span></Link><Link href="/login"><ArrowUpRight size={16} /><span>الحساب</span></Link></nav>
    </div>
  );
}
