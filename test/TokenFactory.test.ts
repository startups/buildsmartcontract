import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits, parseEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ReBakedDAO, ReBakedDAO__factory, TokenFactory, TokenFactory__factory, IOUToken, IOUToken__factory } from "../typechain-types";
import { ZERO_ADDRESS } from "./utils";

// Contract Factories
let deployer: SignerWithAddress;
let treasury: SignerWithAddress;
let accounts: SignerWithAddress[];
let reBakedDAO: ReBakedDAO;
let tokenFactory: TokenFactory;
let iouToken: IOUToken;

// Useful variables
const TOKEN_10 = parseUnits("10", 18);

let initiator: SignerWithAddress;

const tokenName = "Pioneer", tokenSymbol = "PIO";

describe("Testing TokenFactory contract", () => {
	beforeEach(async () => {
		[deployer, initiator, treasury, ...accounts] = await ethers.getSigners();
		const TokenFactory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
		const IOUToken = (await ethers.getContractFactory("IOUToken")) as IOUToken__factory;
		const ReBakedDAO = (await ethers.getContractFactory("ReBakedDAO")) as ReBakedDAO__factory;

		tokenFactory = (await upgrades.deployProxy(TokenFactory, [])) as TokenFactory;
		iouToken = await IOUToken.deploy(initiator.address, "10000000000000000000000", tokenName, tokenSymbol);
		reBakedDAO = (await upgrades.deployProxy(ReBakedDAO, [treasury.address, tokenFactory.address])) as ReBakedDAO;
		await reBakedDAO.deployed();
	});

	describe("Validating initialized state of contracts", () => {
		it("Validating initialized state of ReBakedDAO", async () => {
			expect(await tokenFactory.owner()).to.equal(deployer.address);
			expect(await tokenFactory.reBakedDao()).to.equal(ZERO_ADDRESS);
		});
	});

	describe("Testing `setReBakedDAO` function", () => {
		it("[Fail]: Caller is not the owner", async () => {
			await expect(tokenFactory.connect(treasury).setReBakedDao(reBakedDAO.address)).to.revertedWith("Ownable: caller is not the owner");
		});

		it("[OK]: Set reBakedDAO successfully", async () => {
			await tokenFactory.connect(deployer).setReBakedDao(reBakedDAO.address);
			expect(await tokenFactory.reBakedDao()).to.equal(reBakedDAO.address);
		});
	});

	describe("Testing `deployToken` function", () => {
		it("[Fail]: Rebaked DAO is not set", async () => {
			await expect(tokenFactory.connect(deployer).deployToken(TOKEN_10, tokenName, tokenSymbol)).to.revertedWith("reBakedDao address is not set");
		});

		it("[Fail]: Caller is not ReBakedDAO", async () => {
			await tokenFactory.connect(deployer).setReBakedDao(reBakedDAO.address);
			await expect(tokenFactory.connect(deployer).deployToken(TOKEN_10, tokenName, tokenSymbol)).to.revertedWith("only reBakedDao can call");
		});

		it("[OK]: Deploy new token successfully", async () => {
			await tokenFactory.connect(deployer).setReBakedDao(reBakedDAO.address);
			const tx = await reBakedDAO.connect(initiator).createProject(ZERO_ADDRESS, TOKEN_10);
			const receipt = await tx.wait();
			const args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			const projectId = args[0];

			await reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId, tokenName, tokenSymbol);
			const project = await reBakedDAO.getProjectData(projectId);
			expect(project.token).not.equal(ZERO_ADDRESS);
		});
	});
});

