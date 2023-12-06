const { ethers, upgrades, network, run } = require("hardhat");
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LearnToEarn, LearnToEarn__factory, TokenFactory, TokenFactory__factory, NFTReward__factory, NFTReward } from "../typechain-types";
import { Table } from "./utils";
const fs = require("fs");

const table = new Table();

async function main() {
	const [deployer, owner, ...signers]: SignerWithAddress[] = await ethers.getSigners();

	const NFTReward_factory = (await ethers.getContractFactory("NFTReward")) as NFTReward__factory;
	const TokenFactory_factory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
	const LearnToEarn_factory = (await ethers.getContractFactory("LearnToEarn")) as LearnToEarn__factory;

	console.log("============DEPLOYING CONTRACTS============");

	const nftReward: NFTReward = await NFTReward_factory.deploy();
	await nftReward.deployed();
	table.add([{ name: "NFTReward", type: "deploy", address: nftReward.address }]);

	const tokenFactory: TokenFactory = (await upgrades.deployProxy(TokenFactory_factory, [nftReward.address])) as TokenFactory;
	await tokenFactory.deployed();
	const tokenFactoryVerifyAddress: string = await upgrades.erc1967.getImplementationAddress(tokenFactory.address);
	table.add([
		{ name: "TokenFactory", type: "proxy", address: tokenFactory.address },
		{ name: "TokenFactory", type: "verify", address: tokenFactoryVerifyAddress },
	]);

	const learnToEarn: LearnToEarn = (await upgrades.deployProxy(LearnToEarn_factory, [])) as LearnToEarn;
	await learnToEarn.deployed();
	const learnToEarnVerifyAddress: string = await upgrades.erc1967.getImplementationAddress(learnToEarn.address);
	table.add([
		{ name: "LearnToEarn", type: "proxy", address: learnToEarn.address },
		{ name: "LearnToEarn", type: "verify", address: learnToEarnVerifyAddress },
	]);

	table.log();

	console.log("============SAVE CONTRACTS ADDRESS============");
	await table.save("deployed", `${network.name}_${Date.now()}.json`);

	console.log("============EARLY TRANSACTIONS============");
	await tokenFactory.setLearnToEarn(learnToEarn.address);

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

