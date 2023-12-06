const { ethers, network, run } = require("hardhat");
import { ERC721Test__factory, ERC721Test } from "../typechain-types";
import { Table } from "./utils";

const table = new Table();

async function main() {
	const ERC721Test_factory = (await ethers.getContractFactory("ERC721Test")) as ERC721Test__factory;

	console.log("============DEPLOYING CONTRACTS============");

	const erc721Test: ERC721Test = await ERC721Test_factory.deploy("Pioneer Certificate", "PICE");
	await erc721Test.deployed();
	table.add([{ name: "ERC721Test", type: "deploy", address: erc721Test.address }]);
	table.log();

	console.log("============SAVE CONTRACTS ADDRESS============");
	await table.save("deployed", `nft_test_${network.name}_${Date.now()}.json`);

	console.log("============VERIFY CONTRACTS============");
	await run("verify:verify", {
		address: erc721Test.address,
		constructorArguments: ["Pioneer Certificate", "PICE"],
	}).catch(console.log);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});

