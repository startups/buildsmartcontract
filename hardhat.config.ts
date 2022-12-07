// Loading env configs for deploying and public contract source
import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";
dotenv.config();

// All tools for hardhat and smart contracts
import "@nomicfoundation/hardhat-toolbox";

// Openzeppelin upgrade contract feature
import "@openzeppelin/hardhat-upgrades";

// Show contract's size
import "hardhat-contract-sizer";

const config: HardhatUserConfig = {
	defaultNetwork: "hardhat",
	networks: {
		hardhat: {
			accounts: { count: 20 },
		},
		goerli: {
			url: "https://eth-goerli.g.alchemy.com/v2/yiaZ5Hg5fTRH46ijJywVW1WF5ltv47xI",
			accounts: [process.env.GOERLI_DEPLOY_ACCOUNT!],
			chainId: 5,
		},
		polygonMumbai: {
			url: "https://matic-mumbai.chainstacklabs.com",
			accounts: [process.env.POLYGON_DEPLOY_ACCOUNT!],
			chainId: 80001,
		},
		bscTestnet: {
			url: "https://data-seed-prebsc-1-s3.binance.org:8545/",
			accounts: [process.env.BSC_DEPLOY_ACCOUNT!],
			chainId: 97,
		},
	},
	etherscan: {
		apiKey: {
			goerli: process.env.GOERLI_SCAN_API_KEY!,
			polygonMumbai: process.env.POLYGON_TEST_API_KEY!,
			bscTestnet: process.env.BSC_TEST_API_KEY!,
		},
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

