import { ethers, upgrades, network, run } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LearnToEarn, LearnToEarn__factory } from "../typechain-types";
import { Table } from "./utils";
import * as contractAddresses from "../deployed/polygonMumbai_1675766902630.json";

const table = new Table();

async function main() {
	const [deployer, owner, ...signers]: SignerWithAddress[] = await ethers.getSigners();

	console.log("============UPGRADING CONTRACTS============");

	const LearnToEarn_factory = (await ethers.getContractFactory("LearnToEarn")) as LearnToEarn__factory;
	const learnToEarn: LearnToEarn = (await upgrades.upgradeProxy(contractAddresses.LearnToEarn_proxy, LearnToEarn_factory)) as LearnToEarn;
	await learnToEarn.deployed();
	const learnToEarnVerifyAddress: string = await upgrades.erc1967.getImplementationAddress(learnToEarn.address);
	table.add([
		{ name: "LearnToEarn", type: "proxy", address: learnToEarn.address },
		{ name: "LearnToEarn", type: "verify", address: learnToEarnVerifyAddress },
	]);

	console.log("============VERIFY CONTRACTS============");

	await run("verify:verify", {
		address: learnToEarnVerifyAddress,
	}).catch(console.log);

	console.log("============SAVE CONTRACTS ADDRESS============");
	// Add non deployed contract to table
	table.add([
		{ name: "NFTReward", type: "deploy", address: contractAddresses.NFTReward_deploy },
		{ name: "TokenFactory", type: "proxy", address: contractAddresses.TokenFactory_proxy },
		{ name: "TokenFactory", type: "verify", address: contractAddresses.TokenFactory_verify },
	]);
	await table.save("deployed", `upgraded_${network.name}_${Date.now()}.json`);

	table.log();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});