import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";

export type WalletSource = "metamask" | "walletconnect";

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  connect?: () => Promise<unknown>;
  disconnect?: () => Promise<void>;
  isMetaMask?: boolean;
}

export function getWalletErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; error?: { message?: unknown }; code?: unknown };
    if (candidate.code === 4001) return "تم رفض الطلب من المحفظة.";
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
    if (typeof candidate.error?.message === "string" && candidate.error.message.trim()) return candidate.error.message;
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Keep the safe fallback for circular provider errors.
    }
  }
  return fallback;
}

export const SUPPORTED_CHAINS = {
  ethereum: {
    id: 1,
    hexId: "0x1",
    name: "Ethereum",
    symbol: "ETH",
    shortName: "ETH",
    explorer: "https://etherscan.io",
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  polygon: {
    id: 137,
    hexId: "0x89",
    name: "Polygon",
    symbol: "POL",
    shortName: "POL",
    explorer: "https://polygonscan.com",
    usdt: "0xc2132D05D31c914a87C6611C10748AaCb58e8F",
  },
  bnb: {
    id: 56,
    hexId: "0x38",
    name: "BNB Chain",
    symbol: "BNB",
    shortName: "BNB",
    explorer: "https://bscscan.com",
    usdt: "0x55d398326f99059fF775485246999027B3197955",
  },
} as const;

export type ChainKey = keyof typeof SUPPORTED_CHAINS;

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

let walletConnectProviderPromise: Promise<Eip1193Provider> | null = null;

export async function getWalletConnectProvider() {
  const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? "1e303f141fd5e654983c342b597735fb";

  if (!walletConnectProviderPromise) {
    walletConnectProviderPromise = EthereumProvider.init({
      projectId,
      optionalChains: [1, 137, 56],
      showQrModal: true,
      metadata: {
        name: "Noura",
        description: "محفظة Noura غير الوصائية",
        url: window.location.origin,
        icons: [],
      },
    }).then((provider) => provider as unknown as Eip1193Provider).catch((error) => {
      walletConnectProviderPromise = null;
      throw new Error(getWalletErrorMessage(error, "تعذر تهيئة WalletConnect."));
    });
  }

  return walletConnectProviderPromise;
}

export async function getInjectedProvider(): Promise<Eip1193Provider> {
  const ethereum = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  if (!ethereum) throw new Error("لم يتم العثور على MetaMask. ثبّت الإضافة أو استخدم WalletConnect.");
  if (ethereum.isMetaMask === false) throw new Error("المحفظة المكتشفة ليست MetaMask.");
  await ethereum.request({ method: "eth_requestAccounts" });
  return ethereum;
}

export async function connectWallet(source: WalletSource): Promise<Eip1193Provider> {
  if (source === "metamask") return getInjectedProvider();
  const provider = await getWalletConnectProvider();
  try {
    await provider.connect?.();
    await provider.request({ method: "eth_requestAccounts" });
  } catch (error) {
    throw new Error(getWalletErrorMessage(error, "تعذر إكمال اتصال WalletConnect."));
  }
  return provider;
}

export async function getWalletSnapshot(provider: Eip1193Provider, chainKey: ChainKey) {
  const chain = SUPPORTED_CHAINS[chainKey];
  const browserProvider = new BrowserProvider(provider as any);
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error("لم يتم اختيار حساب من المحفظة.");

  const network = await browserProvider.getNetwork();
  if (Number(network.chainId) !== chain.id) {
    return { address, chainId: Number(network.chainId), chain, usdtBalance: "—", nativeBalance: "—", wrongNetwork: true };
  }

  const token = new Contract(chain.usdt, ERC20_ABI, browserProvider);
  const [rawUsdt, rawNative] = await Promise.all([
    token.balanceOf(address) as Promise<bigint>,
    browserProvider.getBalance(address),
  ]);

  return {
    address,
    chainId: chain.id,
    chain,
    usdtBalance: formatUnits(rawUsdt, 6),
    nativeBalance: formatUnits(rawNative, 18),
    wrongNetwork: false,
  };
}

export async function switchToChain(provider: Eip1193Provider, chainKey: ChainKey) {
  const chain = SUPPORTED_CHAINS[chainKey];
  await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.hexId }] });
}

export async function sendUsdt(provider: Eip1193Provider, chainKey: ChainKey, recipient: string, amount: string) {
  const chain = SUPPORTED_CHAINS[chainKey];
  const browserProvider = new BrowserProvider(provider as any);
  const signer = await browserProvider.getSigner();
  const token = new Contract(chain.usdt, ERC20_ABI, signer);
  const decimals = Number(await token.decimals());
  const tx = await token.transfer(recipient, parseUnits(amount, decimals));
  return tx.wait();
}
