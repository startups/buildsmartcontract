import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits, formatBytes32String } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LearnToEarn, LearnToEarn__factory, IOUToken, IOUToken__factory, TokenFactory, TokenFactory__factory, NFTReward, NFTReward__factory } from "../typechain-types";
import { ZERO_ADDRESS, MAX_UINT256, getTimestamp, getBlock, solidityKeccak256, skipTime } from "./utils";
import { Result } from "@ethersproject/abi";
import { ContractReceipt, ContractTransaction } from "ethers";

// Contract Variables
let deployer: SignerWithAddress;
let creator: SignerWithAddress;
let accounts: SignerWithAddress[];
let tokenFactory: TokenFactory;
let learnToEarn: LearnToEarn;
let nftReward: NFTReward;

let learner1: SignerWithAddress;
let learner2: SignerWithAddress;
let iouToken: IOUToken;

const TOKEN_1 = parseUnits("1", 18);
const TOKEN_50 = parseUnits("50", 18);
const TOKEN_100 = parseUnits("100", 18);
const SIXTY_DAYS = 60 * 24 * 60 * 60;
const tokenName = "Pioneer",
	tokenSymbol = "PIO";

describe.only("LearnToEarn contract", () => {
	beforeEach(async () => {
		[deployer, creator, learner1, learner2, ...accounts] = await ethers.getSigners();
		const IOUToken = (await ethers.getContractFactory("IOUToken")) as IOUToken__factory;
		const NFTReward_factory = (await ethers.getContractFactory("NFTReward")) as NFTReward__factory;
		const TokenFactory_factory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
		const LearnToEarn_factory = (await ethers.getContractFactory("LearnToEarn")) as LearnToEarn__factory;

		nftReward = await NFTReward_factory.deploy();
		await nftReward.deployed();

		iouToken = await IOUToken.deploy(creator.address, "10000000000000000000000", tokenName, tokenSymbol);
		tokenFactory = (await upgrades.deployProxy(TokenFactory_factory, [nftReward.address])) as TokenFactory;
		learnToEarn = (await upgrades.deployProxy(LearnToEarn_factory, [])) as LearnToEarn;
	});

	it("Validate initialized state of contracts", async () => {
		expect(await learnToEarn.REWARD_COMPLETED_DURATION()).to.equal(SIXTY_DAYS);
		expect(await learnToEarn.owner()).to.equal(deployer.address);
	});

	describe("Testing `createCourse` function", () => {
		it("[Fail]: Zero budget", async () => {
			const NEXT_60_DAYS = Date.now() + SIXTY_DAYS;
			await expect(learnToEarn.connect(creator).createCourse(nftReward.address, 0, 1, NEXT_60_DAYS, false)).to.revertedWith("Zero amount");
		});

		it("[Fail]: Zero bonus", async () => {
			const NEXT_60_DAYS = Date.now() + SIXTY_DAYS;
			await expect(learnToEarn.connect(creator).createCourse(nftReward.address, 100, 0, NEXT_60_DAYS, false)).to.revertedWith("Zero amount");
		});

		it("[Fail]: Invalid rewardAddress address", async () => {
			const NEXT_60_DAYS = Date.now() + SIXTY_DAYS;
			await expect(learnToEarn.connect(creator).createCourse(ZERO_ADDRESS, 100, 1, NEXT_60_DAYS, false)).to.revertedWith("Invalid reward address");
		});

		it("[Fail]: Invalid rewardAddress address", async () => {
			const NEXT_60_DAYS = Date.now() + SIXTY_DAYS;
			await expect(learnToEarn.connect(creator).createCourse(nftReward.address, 2, 3, NEXT_60_DAYS, false)).to.revertedWith("Invalid budget");
		});

		it("[Fail]: Create new project with existed token that has not been approved to transfer", async () => {
			await expect(learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, 0, true)).to.revertedWith("ERC20: insufficient allowance");
		});

		it("[OK]: Create course with bonus is nft successfully", async () => {
			const NEXT_60_DAYS = Date.now() + SIXTY_DAYS;
			const tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(nftReward.address, 100, 1, NEXT_60_DAYS, false);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			const courseId = args[0];

			const course = await learnToEarn.getCourseData(courseId);
			const timestamp: number = await getTimestamp();
			expect(course.creator).to.equal(creator.address);
			expect(course.rewardAddress).to.equal(nftReward.address);
			expect(course.budget).to.equal(100);
			expect(course.budgetAvailable).to.equal(100);
			expect(course.bonus).to.equal(1);
			expect(course.timeCreated).to.closeTo(timestamp, 10);
			expect(course.timeEndBonus).to.equal(NEXT_60_DAYS);
			expect(course.isBonusToken).to.false;
			expect(course.canMintNFT).to.true;
		});

		it("[OK]: Create course with bonus is token successfully", async () => {
			await iouToken.connect(creator).approve(learnToEarn.address, MAX_UINT256);

			const tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, 0, true);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			const courseId = args[0];

			const course = await learnToEarn.getCourseData(courseId);
			const timestamp: number = await getTimestamp();
			expect(course.creator).to.equal(creator.address);
			expect(course.rewardAddress).to.equal(iouToken.address);
			expect(course.budget).to.equal(TOKEN_100);
			expect(course.budgetAvailable).to.equal(TOKEN_100);
			expect(course.bonus).to.equal(TOKEN_1);
			expect(course.timeCreated).to.closeTo(timestamp, 10);
			expect(course.timeEndBonus).to.equal(0);
			expect(course.isBonusToken).to.true;
			expect(course.canMintNFT).to.false;
			expect(await iouToken.balanceOf(learnToEarn.address)).to.equal(TOKEN_100);
		});
	});

	describe("Testing `addBudget` function", () => {
		let courseId1: string;
		let courseId2: string;
		beforeEach(async () => {
			await iouToken.connect(creator).approve(learnToEarn.address, MAX_UINT256);

			let tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, 0, true);
			let receipt: ContractReceipt = await tx.wait();
			let args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId1 = args[0];

			const NEXT_60_DAYS = Date.now() + SIXTY_DAYS;
			tx = await learnToEarn.connect(creator).createCourse(nftReward.address, 100, 1, NEXT_60_DAYS, false);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId2 = args[0];
		});

		it("[Fail]: Caller is not creator", async () => {
			await expect(learnToEarn.connect(learner1).addBudget(courseId1, TOKEN_50)).to.revertedWith("caller is not course creator");
		});

		it("[Fail]: Add zero budget", async () => {
			await expect(learnToEarn.connect(creator).addBudget(courseId1, 0)).to.revertedWith("Zero amount");
		});

		it("[OK]: Add budget token successfully", async () => {
			await expect(learnToEarn.connect(creator).addBudget(courseId1, TOKEN_50)).to.emit(learnToEarn, "AddedBudget").withArgs(courseId1, TOKEN_50);
			const course = await learnToEarn.getCourseData(courseId1);
			expect(course.budget).to.equal(TOKEN_100.add(TOKEN_50));
			expect(course.budgetAvailable).to.equal(TOKEN_100.add(TOKEN_50));
			expect(await iouToken.balanceOf(learnToEarn.address)).to.equal(TOKEN_100.add(TOKEN_50));
		});

		it("[OK]: Add budget NFTS successfully", async () => {
			await expect(learnToEarn.connect(creator).addBudget(courseId2, 40)).to.emit(learnToEarn, "AddedBudget").withArgs(courseId2, 40);
			const course = await learnToEarn.getCourseData(courseId2);
			expect(course.budget).to.equal(140);
			expect(course.budgetAvailable).to.equal(140);
		});
	});
});

