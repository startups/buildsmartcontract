// Loading env configs for deploying and public contract source
import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";
dotenv.config();

import "@nomiclabs/hardhat-ethers";

// Verify and public source code on etherscan
import "@nomiclabs/hardhat-etherscan";

// All tools for hardhat and smart contracts
import "@nomicfoundation/hardhat-toolbox";

// Openzeppelin upgrade contract feature
import "@openzeppelin/hardhat-upgrades";

// Show contract's size
import "hardhat-contract-sizer";

// reporter
import "hardhat-gas-reporter";

const config: HardhatUserConfig = {
	defaultNetwork: "hardhat",
	networks: {
		hardhat: {
			accounts: { count: 20 },
		},
		goerli: {
			url: "https://eth-goerli.g.alchemy.com/v2/yiaZ5Hg5fTRH46ijJywVW1WF5ltv47xI",
			accounts: [process.env.DEPLOY_ACCOUNT!],
			chainId: 5,
		},
		polygonMumbai: {
			url: "https://matic-mumbai.chainstacklabs.com",
			accounts: [process.env.DEPLOY_ACCOUNT!],
			chainId: 80001,
		},
		mumbai: {
			url: "https://polygon-mumbai.g.alchemy.com/v2/zSybnsuH3h_jqalkVmYv2Xbf-bsc3hlx",
			accounts: [process.env.DEPLOY_ACCOUNT as string],
		},
		auroraTestnet: {
			url: "https://testnet.aurora.dev",
			accounts: [process.env.DEPLOY_ACCOUNT!],
		},
		arbitrumGoerli: {
			url: "https://goerli-rollup.arbitrum.io/rpc",
			accounts: [process.env.DEPLOY_ACCOUNT!],
		},
		mainnet: {
			url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
			accounts: [process.env.DEPLOY_ACCOUNT!],
			chainId: 5,
		},
		polygon: {
			url: "https://polygon-rpc.com/",
			accounts: [process.env.DEPLOY_ACCOUNT as string],
		},
		aurora: {
			url: "https://mainnet.aurora.dev",
			accounts: [process.env.DEPLOY_ACCOUNT!],
		},
		arbitrumOne: {
			url: "https://arb1.arbitrum.io/rpc",
			accounts: [process.env.DEPLOY_ACCOUNT!],
		},
	},
	etherscan: {
		apiKey: {
			goerli: process.env.SCAN_API_KEY!,
			polygonMumbai: process.env.POLYGON_API_KEY!,
			arbitrumGoerli: process.env.ARBITRUM_API_KEY!,
			mainnet: process.env.SCAN_API_KEY!,
			polygon: process.env.POLYGON_API_KEY!,
			arbitrumOne: process.env.ARBITRUM_API_KEY!,
		},
		customChains: [
			{
				network: "arbitrumGoerli",
				chainId: 421613,
				urls: {
					apiURL: "https://goerli-rollup.arbitrum.io/rpc",
					browserURL: "https://goerli.arbiscan.io/",
				},
			},
		],
	},
	solidity: {
		compilers: [
			{
				version: "0.8.16",
				settings: {
					optimizer: {
						enabled: true,
						runs: 200,
					},
				},
			},
		],
	},
	paths: {
		sources: "./contracts",
		tests: "./test",
		cache: "./cache",
		artifacts: "./artifacts",
	},
	contractSizer: {
		alphaSort: true,
		disambiguatePaths: false,
		runOnCompile: false,
		strict: true,
	},
	mocha: {
		timeout: 400000,
		color: true,
		reporter: "mocha-multi-reporters",
		reporterOptions: {
			configFile: "./mocha-report.json",
		},
	},
	gasReporter: {
		enabled: false,
		currency: "USD",
		token: "BNB",
		gasPrice: 30,
		coinmarketcap: process.env.COIN_MARKET_API,
	},
};

module.exports = config;

