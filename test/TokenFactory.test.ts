import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits, parseEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TokenFactory, TokenFactory__factory } from "../typechain-types";

// Contract Factories
let deployer: SignerWithAddress;
let treasury: SignerWithAddress;
let accounts: SignerWithAddress[];
let tokenFactory: TokenFactory;


// Useful variables
const TOKEN_10 = parseUnits("10", 18);

let initiator: SignerWithAddress;

describe("Testing TokenFactory contract", () => {
	beforeEach(async () => {
		[deployer, initiator, treasury, ...accounts] = await ethers.getSigners();
		const TokenFactory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;

		tokenFactory = await TokenFactory.deploy();
	});

	describe("Testing `deployToken` function", () => {

		it("[OK]: Deploy new token successfully", async () => {
			await expect(tokenFactory.connect(initiator).deployToken(TOKEN_10, "IOU", "IOU"))
				.to.emit(tokenFactory, 'DeployedToken')
		});
	});
});

