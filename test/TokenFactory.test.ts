import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits, parseEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TokenFactory, TokenFactory__factory, LearnToEarn, LearnToEarn__factory, NFTReward__factory, NFTReward } from "../typechain-types";
import { ZERO_ADDRESS } from "./utils";

// Contract Factories
let deployer: SignerWithAddress;
let accounts: SignerWithAddress[];
let tokenFactory: TokenFactory;
let learnToEarn: LearnToEarn;
let nftReward: NFTReward;

// Useful variables
const TOKEN_10 = parseUnits("10", 18);


describe("Testing TokenFactory contract", () => {
	beforeEach(async () => {
		[deployer, ...accounts] = await ethers.getSigners();
		const NFTReward_factory = (await ethers.getContractFactory("NFTReward")) as NFTReward__factory;
		const TokenFactory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
		const LearnToEarn = (await ethers.getContractFactory("LearnToEarn")) as LearnToEarn__factory;

        nftReward = await NFTReward_factory.deploy();
        await nftReward.deployed();

		tokenFactory = (await upgrades.deployProxy(TokenFactory, [nftReward.address])) as TokenFactory;
		learnToEarn = (await upgrades.deployProxy(LearnToEarn, [])) as LearnToEarn;
		await tokenFactory.deployed();
	});

	describe("Validate parameters of initilizer function", () => {
		it("Invalid NFTReward address", async () => {
			const TokenFactory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
			await expect(upgrades.deployProxy(TokenFactory, [accounts[0].address])).to.revertedWith("Invalid NFTReward address")
		});

		it("Deploy successfully", async () => {
			const NFTReward_factory = (await ethers.getContractFactory("NFTReward")) as NFTReward__factory;
			const TokenFactory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;

			const nftReward: NFTReward = await NFTReward_factory.deploy();
			await nftReward.deployed();
	
			tokenFactory = (await upgrades.deployProxy(TokenFactory, [nftReward.address])) as TokenFactory;
			
			expect(await tokenFactory.templateNFTReward()).to.equal(nftReward.address);
		});
	})

	describe("Validating initialized state of contracts", () => {
		it("Validating initialized state of ReBakedDAO", async () => {
			expect(await tokenFactory.owner()).to.equal(deployer.address);
			expect(await tokenFactory.learnToEarn()).to.equal(ZERO_ADDRESS);
			expect(await tokenFactory.templateNFTReward()).to.equal(nftReward.address);
		});
	});

	describe("Testing `setLearnToEarn` function", () => {
		it("[Fail]: Caller is not the owner", async () => {
			await expect(tokenFactory.connect(accounts[0]).setLearnToEarn(learnToEarn.address)).to.revertedWith("Ownable: caller is not the owner");
		});

		it("[Fail]: Set zero address to learnToEarn", async () => {
			await expect(tokenFactory.connect(deployer).setLearnToEarn(ZERO_ADDRESS)).to.revertedWith("learnToEarn address is not valid");
		})

		it("[OK]: Set learnToEarn successfully", async () => {
			await tokenFactory.connect(deployer).setLearnToEarn(learnToEarn.address);
			expect(await tokenFactory.learnToEarn()).to.equal(learnToEarn.address);
		});
	});

	describe("Testing `deployToken` function", () => {
		it("[OK]: Deploy new token successfully", async () => {
			await expect(tokenFactory.connect(accounts[0]).deployToken(TOKEN_10, "IOU", "IOU"))
				.to.emit(tokenFactory, 'DeployedToken')
		});
	});
	
	describe("Testing `deployNFT` function", () => {

		it("[Fail]: LearnToEarn address is not valid", async () => {
			await expect(tokenFactory.connect(accounts[0]).deployNFT("HI", "HI", "hi")).to.revertedWith("LearnToEarn address is not valid");
		})

		it("[OK]: Deploy new nft contract successfully", async () => {
			await tokenFactory.connect(deployer).setLearnToEarn(learnToEarn.address);
			await expect(tokenFactory.connect(accounts[0]).deployNFT("HI", "HI", "hi"))
				.to.emit(tokenFactory, 'DeployedNFT')
		});
	});
});

