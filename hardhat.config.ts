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
		// kovan: {
		//   provider: function () {
		//     return new HDWalletProvider(
		//       `situate filter sausage wolf melt general swift almost pelican middle session wage`,
		//       `https://kovan.infura.io/v3/4e1930aa5d3746908f69149b0731416b`
		//     );
		//   },
		//   network_id: 42,
		//   networkCheckTimeout: 100000,
		//   gas: 6700000,
		// },
		rinkeby: {
			url: "https://rinkeby.infura.io/v3/4e1930aa5d3746908f69149b0731416b",
			accounts: [process.env.RINKEBY_DEPLOY_ACCOUNT as string],
			// provider: function () {
			//   return new HDWalletProvider(
			//     `session spare pride peasant feel father decade remove zone stock paper rhythm`,
			//     `https://rinkeby.infura.io/v3/4e1930aa5d3746908f69149b0731416b`
			//   );
			// },
			// network_id: 4,
			// networkCheckTimeout: 100000,
			//gas: 6700000,
		},
		kovan: {
			url: "https://kovan.infura.io/v3/4e1930aa5d3746908f69149b0731416b",
			accounts: [process.env.KOVAN_DEPLOY_ACCOUNT as string],
			// provider: function () {
			//   return new HDWalletProvider(
			//     `session spare pride peasant feel father decade remove zone stock paper rhythm`,
			//     `https://rinkeby.infura.io/v3/4e1930aa5d3746908f69149b0731416b`
			//   );
			// },
			// network_id: 4,
			// networkCheckTimeout: 100000,
			//gas: 6700000,
		},
		goerli: {
			url: "https://eth-goerli.g.alchemy.com/v2/yiaZ5Hg5fTRH46ijJywVW1WF5ltv47xI",
			gasPrice: 8000000000,
			accounts: [process.env.GOERLI_DEPLOY_ACCOUNT as string],
		},
	},
	etherscan: {
		apiKey: process.env.SCAN_API_KEY,
	},
	solidity: {
		compilers: [
			{
				version: "0.8.11",
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

