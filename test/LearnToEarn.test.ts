import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits, formatBytes32String } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LearnToEarn, LearnToEarn__factory, IOUToken, IOUToken__factory, TokenFactory, TokenFactory__factory, NFTReward, NFTReward__factory } from "../typechain-types";
import { ZERO_ADDRESS, MAX_UINT256, getTimestamp, BN, skipTime } from "./utils";
import { Result } from "@ethersproject/abi";
import { ContractReceipt, ContractTransaction } from "ethers";
import NFTRewardJSON from "../artifacts/contracts/NFTReward.sol/NFTReward.json";

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
const ONE_DAY = 24 * 60 * 60;
const tokenName = "Pioneer",
	tokenSymbol = "PIO";

describe("LearnToEarn contract", () => {
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

		tokenFactory.setLearnToEarn(learnToEarn.address);
	});

	it("Validate initialized state of contracts", async () => {
		expect(await learnToEarn.REWARD_COMPLETED_DURATION()).to.equal(ONE_DAY * 60);
		expect(await learnToEarn.owner()).to.equal(deployer.address);
	});

	describe("Testing `createCourse` function", () => {
		it("[Fail]: Zero budget", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			await expect(learnToEarn.connect(creator).createCourse(nftReward.address, 0, 1, NEXT_60_DAYS, false)).to.revertedWith("Zero amount");
		});

		it("[Fail]: Zero bonus", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			await expect(learnToEarn.connect(creator).createCourse(nftReward.address, 100, 0, NEXT_60_DAYS, false)).to.revertedWith("Zero amount");
		});

		it("[Fail]: Invalid rewardAddress address", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			await expect(learnToEarn.connect(creator).createCourse(ZERO_ADDRESS, 100, 1, NEXT_60_DAYS, false)).to.revertedWith("Invalid reward address");
		});

		it("[Fail]: Invalid rewardAddress address", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			await expect(learnToEarn.connect(creator).createCourse(nftReward.address, 2, 3, NEXT_60_DAYS, false)).to.revertedWith("Invalid budget");
		});

		it("[Fail]: Create new project with existed token that has not been approved to transfer", async () => {
			await expect(learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, 0, true)).to.revertedWith("ERC20: insufficient allowance");
		});

		it("[OK]: Create course with bonus is nft successfully", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
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

			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
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
			await expect(learnToEarn.connect(creator).addBudget(courseId1, TOKEN_50))
				.to.emit(learnToEarn, "AddedBudget")
				.withArgs(courseId1, TOKEN_50);
			const course = await learnToEarn.getCourseData(courseId1);
			expect(course.budget).to.equal(TOKEN_100.add(TOKEN_50));
			expect(course.budgetAvailable).to.equal(TOKEN_100.add(TOKEN_50));
			expect(await iouToken.balanceOf(learnToEarn.address)).to.equal(TOKEN_100.add(TOKEN_50));
		});

		it("[OK]: Add budget NFTS successfully", async () => {
			await expect(learnToEarn.connect(creator).addBudget(courseId2, 40))
				.to.emit(learnToEarn, "AddedBudget")
				.withArgs(courseId2, 40);
			const course = await learnToEarn.getCourseData(courseId2);
			expect(course.budget).to.equal(140);
			expect(course.budgetAvailable).to.equal(140);
		});
	});

	describe("Testing `completeCourse` function", () => {
		let courseId1: string;
		let courseId2: string;
		let courseId3: string;
		let timeStart: number;
		beforeEach(async () => {
			await tokenFactory.setLearnToEarn(learnToEarn.address);
			let tx: ContractTransaction = await tokenFactory.deployNFT("Certificate", "Cert", "https://ipfs.io/ipfs/QmNZiPk974vDsPmQii3YbrMKfi12KTSNM7XMiYyiea4VYZ/example");
			let receipt: ContractReceipt = await tx.wait();
			let args: Result = receipt.events!.find(ev => ev.event === "DeployedNFT")!.args!;
			const nftRewardAddress = ethers.utils.getAddress(args[0]);

			await iouToken.connect(creator).approve(learnToEarn.address, MAX_UINT256);

			tx = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, 0, true);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId1 = args[0];

			const NEXT_30_DAYS = (await getTimestamp()) + ONE_DAY * 30;
			tx = await learnToEarn.connect(creator).createCourse(nftRewardAddress, 100, 2, NEXT_30_DAYS, false);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId2 = args[0];

			timeStart = (await getTimestamp()) + ONE_DAY;
		});

		it("[Fail]: Caller is not course creator", async () => {
			await expect(learnToEarn.connect(learner1).completeCourse(courseId1, learner1.address, timeStart, [])).to.revertedWith("caller is not course creator");
			await expect(learnToEarn.connect(creator).completeCourse(formatBytes32String("test"), learner1.address, timeStart, [])).to.revertedWith("caller is not course creator");
		});

		it("[Fail]: Invalid time start", async () => {
			await expect(learnToEarn.connect(creator).completeCourse(courseId1, learner1.address, Date.now(), [])).to.revertedWith("Invalid time start");
		});

		it("[Fail]: Already completed", async () => {
			await skipTime(10 * ONE_DAY);
			await learnToEarn.connect(creator).completeCourse(courseId1, learner1.address, timeStart, []);
			await expect(learnToEarn.connect(creator).completeCourse(courseId1, learner1.address, timeStart, [])).to.revertedWith("already completed");
		});

		it("[Fail]: NFTs to reward is not enough", async () => {});

		it("[OK]: Complete course with token awards successfully", async () => {
			await skipTime(10 * ONE_DAY);
			let course1 = await learnToEarn.getCourseData(courseId1);
			await expect(learnToEarn.connect(creator).completeCourse(courseId1, learner1.address, timeStart, []))
				.to.emit(learnToEarn, "ClaimedReward")
				.withArgs(courseId1, learner1.address, course1.bonus)
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId1, learner1.address)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, learner1.address], [BN(-course1.bonus), course1.bonus]);

			course1 = await learnToEarn.getCourseData(courseId1);
			expect(course1.budgetAvailable).to.equal(TOKEN_100.sub(TOKEN_1));
			expect(course1.totalLearnersClaimedBonus).to.equal(1);

			const firstLearner = await learnToEarn.getLearnerData(courseId1, learner1.address);
			let timestamp = await getTimestamp();
			expect(firstLearner.timeStarted).to.equal(timeStart);
			expect(firstLearner.timeCompleted).to.closeTo(timestamp, 10);
			expect(firstLearner.timeRewarded).to.closeTo(timestamp, 10);
			expect(await iouToken.balanceOf(learner1.address)).to.equal(course1.bonus);

			await skipTime(60 * ONE_DAY);

			await learnToEarn.connect(creator).completeCourse(courseId1, learner2.address, timeStart + ONE_DAY * 9 - 1, []);
			course1 = await learnToEarn.getCourseData(courseId1);
			expect(course1.budgetAvailable).to.equal(TOKEN_100.sub(TOKEN_1));
			expect(course1.totalLearnersClaimedBonus).to.equal(1);

			const secondLearner = await learnToEarn.getLearnerData(courseId1, learner2.address);
			timestamp = await getTimestamp();
			expect(secondLearner.timeStarted).to.equal(timeStart + ONE_DAY * 9 - 1);
			expect(secondLearner.timeCompleted).to.closeTo(timestamp, 10);
			expect(secondLearner.timeRewarded).to.equal(0);
			expect(await iouToken.balanceOf(learner2.address)).to.equal(0);
		});

		it("[OK]: Complete course with nft awards successfully", async () => {
			await skipTime(10 * ONE_DAY);
			let course2 = await learnToEarn.getCourseData(courseId2);
			await expect(learnToEarn.connect(creator).completeCourse(courseId2, learner1.address, timeStart, []))
				.to.emit(learnToEarn, "ClaimedReward")
				.withArgs(courseId2, learner1.address, course2.bonus)
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId2, learner1.address);

			course2 = await learnToEarn.getCourseData(courseId2);
			expect(course2.budgetAvailable).to.equal(98);
			expect(course2.totalLearnersClaimedBonus).to.equal(1);

			const firstLearner = await learnToEarn.getLearnerData(courseId2, learner1.address);
			let timestamp = await getTimestamp();
			expect(firstLearner.timeStarted).to.equal(timeStart);
			expect(firstLearner.timeCompleted).to.closeTo(timestamp, 10);
			expect(firstLearner.timeRewarded).to.closeTo(timestamp, 10);
			expect(firstLearner.nftIds.length).to.equal(course2.bonus);

			const nftRewardContract = new ethers.Contract(course2.rewardAddress, NFTRewardJSON.abi, creator);
			for (let i = 0; i < firstLearner.nftIds.length; i++) {
				expect(await nftRewardContract.ownerOf(firstLearner.nftIds[i])).to.equal(learner1.address);
			}
		});
	});
});

