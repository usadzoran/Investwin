import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ContractFactory, JsonRpcProvider, Wallet, parseUnits } from "ethers";

const rpcUrl = process.env.AMOY_RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!rpcUrl || !privateKey) {
  throw new Error("Set AMOY_RPC_URL and DEPLOYER_PRIVATE_KEY in a private environment. Never commit or paste the private key.");
}

const provider = new JsonRpcProvider(rpcUrl, { name: "polygon-amoy", chainId: 80002 });
const deployer = new Wallet(privateKey, provider);
const artifactsDir = path.resolve("artifacts-amoy");
const readArtifact = (name) => ({
  abi: JSON.parse(fs.readFileSync(path.join(artifactsDir, `${name}.abi`), "utf8")),
  bytecode: `0x${fs.readFileSync(path.join(artifactsDir, `${name}.bin`), "utf8").trim()}`,
});

const treasuryArtifact = readArtifact("InvestwinTreasury");
const tokenArtifact = readArtifact("MockUSDT");
const tokenAddress = process.env.TEST_USDT_ADDRESS;
const signerAddress = process.env.CLAIM_SIGNER_ADDRESS || deployer.address;
const dailyLimit = parseUnits(process.env.DAILY_LIMIT_USDT || "1000", 6);

let token;
if (tokenAddress) {
  token = tokenAddress;
  console.log(`Using existing test token: ${token}`);
} else {
  const tokenFactory = new ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, deployer);
  const tokenContract = await tokenFactory.deploy();
  await tokenContract.waitForDeployment();
  token = await tokenContract.getAddress();
  console.log(`MockUSDT deployed: ${token}`);
}

const treasuryFactory = new ContractFactory(treasuryArtifact.abi, treasuryArtifact.bytecode, deployer);
const treasury = await treasuryFactory.deploy(token, signerAddress, dailyLimit);
await treasury.waitForDeployment();
const treasuryAddress = await treasury.getAddress();
console.log(`InvestwinTreasury deployed: ${treasuryAddress}`);
console.log(`Owner: ${deployer.address}`);
console.log(`Claim signer: ${signerAddress}`);
console.log(`Network: Polygon Amoy (chainId 80002)`);
console.log(`Explorer: https://amoy.polygonscan.com/address/${treasuryAddress}`);
console.log("Fund the treasury only with test tokens, then configure the public contract address in the app.");
