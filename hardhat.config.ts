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
			accounts: ["0a2eaf2431b468cad59d5931aa82bb115271990fdd1c09a3ad449238db52e4d8"],
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
			accounts: ["0a2eaf2431b468cad59d5931aa82bb115271990fdd1c09a3ad449238db52e4d8"],
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
			accounts: ["f0f8575c20eace873dfacb753a1ec0181097bef52fcd0b72a7ab33f7e1386434", "6493c64e0c79722f1032d53696211daf05d6d25df266a1a0ec5c9e06dce08428", "1bfd3e152caf6a2df1d5a22b4441286bce14ddd354a653e2b3239ceb4118ac43"],
		},
	},
	etherscan: {
		apiKey: "P2DDGKCV7KEVRJH8DHQYGG45GZNNBY4SV9",
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
		runOnCompile: true,
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

