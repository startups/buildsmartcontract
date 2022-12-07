import { ethers, upgrades, network, run } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LearnToEarn, LearnToEarn__factory, IOUToken, IOUToken__factory, TokenFactory, TokenFactory__factory, NFTReward, NFTReward__factory, ERC721Test, ERC721Test__factory } from "../typechain-types";
import { Table } from "./utils";
import * as contractAddresses from "../deployed/bscTestnet_1670383646352.json";

const table = new Table();

async function main() {
	const [deployer, owner, ...signers]: SignerWithAddress[] = await ethers.getSigners();

	const NFTReward_factory = (await ethers.getContractFactory("NFTReward")) as NFTReward__factory;
	const TokenFactory_factory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
	const LearnToEarn_factory = (await ethers.getContractFactory("LearnToEarn")) as LearnToEarn__factory;

	console.log("============UPGRADING CONTRACTS============");

	const tokenFactory = (await upgrades.upgradeProxy(contractAddresses.TokenFactory_proxy, TokenFactory_factory)) as TokenFactory;
	await tokenFactory.deployed();
	const tokenFactoryVerifyAddress: string = await upgrades.erc1967.getImplementationAddress(tokenFactory.address);
	table.add([
		{ name: "TokenFactory", type: "proxy", address: tokenFactory.address },
		{ name: "TokenFactory", type: "verify", address: tokenFactoryVerifyAddress },
	]);

	const learnToEarn = (await upgrades.upgradeProxy(contractAddresses.LearnToEarn_proxy, LearnToEarn_factory)) as LearnToEarn;
	await learnToEarn.deployed();
	const learnToEarnVerifyAddress: string = await upgrades.erc1967.getImplementationAddress(learnToEarn.address);
	table.add([
		{ name: "LearnToEarn", type: "proxy", address: learnToEarn.address },
		{ name: "LearnToEarn", type: "verify", address: learnToEarnVerifyAddress },
	]);

	table.log();

	console.log("============SAVE CONTRACTS ADDRESS============");
	await table.save("upgraded", `${network.name}_${Date.now()}.json`);

	console.log("============VERIFY CONTRACTS============");
	for (const [name, type, address] of table.toArray(["proxy", "deploy"]))
		await run("verify:verify", {
			address: address,
		}).catch(console.log);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

