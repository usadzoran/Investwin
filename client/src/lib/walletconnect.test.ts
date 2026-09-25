import { describe, expect, it } from "vitest";
import { EthereumProvider } from "@walletconnect/ethereum-provider";

describe("WalletConnect configuration", () => {
  it("initializes the configured Reown project id", async () => {
    const projectId = process.env.VITE_WALLETCONNECT_PROJECT_ID;

    expect(projectId).toMatch(/^[a-f0-9]{32}$/i);

    const provider = await EthereumProvider.init({
      projectId: projectId as string,
      optionalChains: [1, 137, 56],
      showQrModal: false,
      metadata: {
        name: "Noura",
        description: "Noura non-custodial wallet",
        url: "https://noura.example",
        icons: [],
      },
    });

    expect(provider).toBeDefined();
    await provider.disconnect();
  }, 30_000);
});
