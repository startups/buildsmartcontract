import { ethers, upgrades, network, run } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LearnToEarn, LearnToEarn__factory, TokenFactory, TokenFactory__factory } from "../typechain-types";
import { Table } from "./utils";
import * as contractAddresses from "../deployed/goerli_1670818239617.json";

const table = new Table();

async function main() {
	const [deployer, owner, ...signers]: SignerWithAddress[] = await ethers.getSigners();

	const TokenFactory_factory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
	const LearnToEarn_factory = (await ethers.getContractFactory("LearnToEarn")) as LearnToEarn__factory;

	console.log("============UPGRADING CONTRACTS============");

	const tokenFactory: TokenFactory = (await upgrades.upgradeProxy(contractAddresses.TokenFactory_proxy, TokenFactory_factory)) as TokenFactory;
	await tokenFactory.deployed();
	const tokenFactoryVerifyAddress: string = await upgrades.erc1967.getImplementationAddress(tokenFactory.address);
	table.add([
		{ name: "TokenFactory", type: "proxy", address: tokenFactory.address },
		{ name: "TokenFactory", type: "verify", address: tokenFactoryVerifyAddress },
	]);

	const learnToEarn: LearnToEarn = (await upgrades.upgradeProxy(contractAddresses.LearnToEarn_proxy, LearnToEarn_factory)) as LearnToEarn;
	await learnToEarn.deployed();
	const learnToEarnVerifyAddress: string = await upgrades.erc1967.getImplementationAddress(learnToEarn.address);
	table.add([
		{ name: "LearnToEarn", type: "proxy", address: learnToEarn.address },
		{ name: "LearnToEarn", type: "verify", address: learnToEarnVerifyAddress },
	]);

	table.log();

	console.log("============SAVE CONTRACTS ADDRESS============");
	// Add non deployed contract to table
	table.add([{ name: "TokenFactory", type: "deploy", address: contractAddresses.NFTReward_deploy }]);
	await table.save("deployed", `upgraded_${network.name}_${Date.now()}.json`);

	console.log("============VERIFY CONTRACTS============");
	for (const [name, type, address] of table.toArray(["proxy"]))
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

