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
		mumbai: {
			url: "https://polygon-mumbai.g.alchemy.com/v2/zSybnsuH3h_jqalkVmYv2Xbf-bsc3hlx",
			accounts: [process.env.MUMBAI_DEPLOY_ACCOUNT!]
		},
		auroraTestnet: {
			url: "https://testnet.aurora.dev",
			accounts: [process.env.AURORA_TESTNET_DEPLOY_ACCOUNT!]
		},
		arbitrumGoerli: {
			// url: "https://arb-goerli.g.alchemy.com/v2/HvsY1VKZgg_YEJHv_o9GAjjaLmmEO8Xl",
			url: "https://goerli-rollup.arbitrum.io/rpc",
			accounts: [process.env.ARBITRUM_GOERLI_DEPLOY_ACCOUNT!]
		}
	},
	etherscan: {
		apiKey: {
			goerli: process.env.GOERLI_SCAN_API_KEY!,
			polygonMumbai: process.env.POLYGON_TEST_API_KEY!,
			bscTestnet: process.env.BSC_TEST_API_KEY!,
			auroraTestnet: process.env.AURORA_TEST_API_KEY!,
			arbitrumGoerli: "FTZHM5RTPBMCT6WWQCVHHXCFKIKCVDJQKZ"
		},
		customChains: [
			{
				network: "arbitrumGoerli",
				chainId: 421613,
				urls: {
					// apiURL: "https://arb-goerli.g.alchemy.com/v2/HvsY1VKZgg_YEJHv_o9GAjjaLmmEO8Xl",
					apiURL: "https://goerli-rollup.arbitrum.io/rpc",
					browserURL: "https://goerli.arbiscan.io/"
				}
			}
		]
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

