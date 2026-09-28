# Investwin testnet treasury

This folder contains a testnet-only treasury flow for **Polygon Amoy**.

- Network: Polygon Amoy
- Chain ID: `80002`
- RPC: `https://rpc-amoy.polygon.technology/`
- Explorer: `https://amoy.polygonscan.com/`
- Token used for the first test: `MockUSDT` (`tUSDT`, 6 decimals)

## Contracts

- `InvestwinTreasury.sol`: non-custodial claim treasury. The user submits and signs `claim`; an authorized claim signer signs the EIP-712 authorization off-chain. It enforces recipient binding, nonce replay protection, deadline, pause, owner-controlled signer rotation, and a hard maximum daily limit of 1,000 USDT-style units.
- `MockUSDT.sol`: mintable test token for Amoy experiments only. Never deploy or use it on a production network.

## Deployment

Compile first with the repository's Solidity compiler command, then set these variables only in a private environment:

```bash
AMOY_RPC_URL=https://rpc-amoy.polygon.technology/ \
DEPLOYER_PRIVATE_KEY=... \
CLAIM_SIGNER_ADDRESS=0x... \
node scripts/deploy-amoy.mjs
```

Do not commit `DEPLOYER_PRIVATE_KEY`. The deployer needs Amoy POL for gas. The first deployment should use only `MockUSDT`; do not substitute a mainnet token address on a testnet.

After deployment, fund the treasury with test tokens and test:

1. a valid claim signed by the configured claim signer;
2. a wrong-recipient signature;
3. a reused nonce;
4. an expired deadline;
5. a daily-limit overflow;
6. pause/unpause;
7. owner and claim-signer rotation.

The contract has not been deployed from this repository until a funded deployer wallet and RPC endpoint are configured. No private key is required in chat.
