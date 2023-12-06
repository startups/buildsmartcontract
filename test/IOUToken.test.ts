import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { IOUToken, IOUToken__factory } from "../typechain-types";
import { ZERO_ADDRESS } from "./utils";

// Contract Factories
let deployer: SignerWithAddress;
let accounts: SignerWithAddress[];
let IOUToken: IOUToken__factory;

// Useful variables
const TOKEN_10 = parseUnits("10", 18);

const tokenName = "Pioneer",
	tokenSymbol = "PIO";

describe("Testing IOUToken contract", () => {
	beforeEach(async () => {
		[deployer, ...accounts] = await ethers.getSigners();
		IOUToken = (await ethers.getContractFactory("IOUToken")) as IOUToken__factory;
	});

	describe("Testing contructor function", () => {
		it("Deploy token successfully", async () => {
			const iouToken = await IOUToken.deploy(deployer.address, TOKEN_10, tokenName, tokenSymbol);
			const deployerBalance = await iouToken.balanceOf(deployer.address);
			expect(deployerBalance).to.equal(TOKEN_10);
		});
	});

	describe("Testing `burn` function", () => {
		it("Burn token successfully", async () => {
			const iouToken = await IOUToken.deploy(deployer.address, TOKEN_10, tokenName, tokenSymbol);
			await iouToken.burn(TOKEN_10.div(2));
			const deployerBalance = await iouToken.balanceOf(deployer.address);
			expect(deployerBalance).to.equal(TOKEN_10.div(2));
		});
	});
});

