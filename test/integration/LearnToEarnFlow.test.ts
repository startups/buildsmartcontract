import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits, formatBytes32String } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LearnToEarn, LearnToEarn__factory, IOUToken, IOUToken__factory, TokenFactory, TokenFactory__factory, NFTReward, NFTReward__factory, ERC721Test, ERC721Test__factory } from "../../typechain-types";
import { ZERO_ADDRESS, MAX_UINT256, getTimestamp, BN, skipTime, BalanceTracker as BT } from "../utils";
import { Result } from "@ethersproject/abi";
import { ContractReceipt, ContractTransaction } from "ethers";
import NFTRewardJSON from "../../artifacts/contracts/NFTReward.sol/NFTReward.json";

let iouToken: IOUToken;
let nftReward: NFTReward;
let erc721Test: ERC721Test;
let tokenFactory: TokenFactory;
let learnToEarn: LearnToEarn;

let accounts: SignerWithAddress[];
let deployer: SignerWithAddress;
let creator: SignerWithAddress;
let learner1: SignerWithAddress;
let learner2: SignerWithAddress;
let learner3: SignerWithAddress;
let learner4: SignerWithAddress;

const TOKEN_1 = parseUnits("1", 18);
const ONE_DAY = 24 * 60 * 60;
const tokenName = "Pioneer",
	tokenSymbol = "PIO";
const nftName = "Pioneer Certificate",
	nftSymbol = "PICE",
	nftURI = "https://ipfs.io/ipfs/QmNZiPk974vDsPmQii3YbrMKfi12KTSNM7XMiYyiea4VYZ/example";

let creatorBT: BT;
let learner1BT: BT;
let learner2BT: BT;
let learner3BT: BT;
let learner4BT: BT;

describe("Integration test LearnToEarn contract", () => {
	before(async () => {
		[deployer, creator, learner1, learner2, learner3, learner4, ...accounts] = await ethers.getSigners();
		const IOUToken = (await ethers.getContractFactory("IOUToken")) as IOUToken__factory;
		const NFTReward_factory = (await ethers.getContractFactory("NFTReward")) as NFTReward__factory;
		const ERC721Test_factory = (await ethers.getContractFactory("ERC721Test")) as ERC721Test__factory;
		const TokenFactory_factory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
		const LearnToEarn_factory = (await ethers.getContractFactory("LearnToEarn")) as LearnToEarn__factory;

		nftReward = await NFTReward_factory.deploy();
		await nftReward.deployed();

		erc721Test = await ERC721Test_factory.deploy(nftName, nftSymbol);
		await erc721Test.deployed();

		iouToken = await IOUToken.deploy(creator.address, "10000000000000000000000", tokenName, tokenSymbol);
		tokenFactory = (await upgrades.deployProxy(TokenFactory_factory, [nftReward.address])) as TokenFactory;
		learnToEarn = (await upgrades.deployProxy(LearnToEarn_factory, [])) as LearnToEarn;

		tokenFactory.setLearnToEarn(learnToEarn.address);

		// Setup balance tracker
		creatorBT = new BT(creator.address, [iouToken.address, erc721Test.address]);
		learner1BT = new BT(learner1.address, [iouToken.address, erc721Test.address]);
		learner2BT = new BT(learner2.address, [iouToken.address, erc721Test.address]);
		learner3BT = new BT(learner3.address, [iouToken.address, erc721Test.address]);
		learner4BT = new BT(learner4.address, [iouToken.address, erc721Test.address]);

		await creatorBT.takeSnapshot("begin");
		await learner1BT.takeSnapshot("begin");
		await learner2BT.takeSnapshot("begin");
		await learner3BT.takeSnapshot("begin");
		await learner4BT.takeSnapshot("begin");

		await iouToken.connect(creator).approve(learnToEarn.address, MAX_UINT256);
	});

	describe("Verify contract parameter", () => {
		it("Verify NFTReward contract parameters", async () => {
			expect(await nftReward.learnToEarn()).to.equal(ZERO_ADDRESS);
			expect(await nftReward.tokenIds()).to.equal(0);
			expect(await nftReward.uri()).to.equal("");
		});

		it("Verify TokenFactory contract parameters", async () => {
			expect(await tokenFactory.learnToEarn()).to.equal(learnToEarn.address);
			expect(await tokenFactory.templateNFTReward()).to.equal(nftReward.address);
			expect(await tokenFactory.owner()).to.equal(deployer.address);
		});

		it("Verify LearnToEarn contract parameters", async () => {
			expect(await learnToEarn.owner()).to.equal(deployer.address);
		});
	});

	describe("Create new course with existed token and duration time bonus (Course 1)", () => {
		let courseId1: string;

		it("Create course 1 with existed token and duration 30 days", async () => {
			const tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_1.mul(20), TOKEN_1.mul(10),(await getTimestamp()) + 14, ONE_DAY * 30, true, true);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId1 = args[0];

			const timestamp = await getTimestamp();
			const course1 = await learnToEarn.getCourseData(courseId1);
			expect(course1.creator).to.equal(creator.address);
			expect(course1.timeCreated).to.closeTo(timestamp + 14, 10);
			expect(course1.rewardAddress).to.equal(iouToken.address);
			expect(course1.budget).to.equal(TOKEN_1.mul(20));
			expect(course1.budgetAvailable).to.equal(TOKEN_1.mul(20));
			expect(course1.bonus).to.equal(TOKEN_1.mul(10));
			expect(course1.timeEndBonus).to.equal(ONE_DAY * 30);
			expect(course1.isBonusToken).to.be.true;
			expect(course1.isUsingDuration).to.be.true;
			expect(course1.totalLearnersClaimedBonus).to.equal(0);
			expect(course1.canMintNFT).to.be.false;
		});

		it("Learner 1, 2 complete and receive bonus", async () => {
			await skipTime(ONE_DAY);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 14);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId1, learner1.address, timeStarted, currentTimestamp, []))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId1, learner1.address)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, learner1.address], [`-${TOKEN_1.mul(10)}`, TOKEN_1.mul(10)]);

			let course1 = await learnToEarn.getCourseData(courseId1);
			expect(course1.budgetAvailable).to.equal(TOKEN_1.mul(10));
			expect(course1.totalLearnersClaimedBonus).to.equal(1);

			let timestamp = await getTimestamp();
			const courseLearner1 = await learnToEarn.getLearnerData(courseId1, learner1.address);
			expect(courseLearner1.timeStarted).to.equal(timeStarted);
			expect(courseLearner1.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner1.timeRewarded).to.closeTo(timestamp, 10);

			await expect(learnToEarn.connect(creator).completeCourse(courseId1, learner2.address, timeStarted, timestamp, []))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId1, learner2.address)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, learner2.address], [`-${TOKEN_1.mul(10)}`, TOKEN_1.mul(10)]);

			course1 = await learnToEarn.getCourseData(courseId1);
			expect(course1.budgetAvailable).to.equal(0);
			expect(course1.totalLearnersClaimedBonus).to.equal(2);

			timestamp = await getTimestamp();
			const courseLearner2 = await learnToEarn.getLearnerData(courseId1, learner2.address);
			expect(courseLearner2.timeStarted).to.equal(timeStarted);
			expect(courseLearner2.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner2.timeRewarded).to.closeTo(timestamp, 10);
		});

		it("Creator add new budget to course", async () => {
			await expect(learnToEarn.connect(creator).addBudget(courseId1, TOKEN_1.mul(10)))
				.to.emit(learnToEarn, "AddedBudget")
				.withArgs(courseId1, TOKEN_1.mul(10))
				.to.changeTokenBalances(iouToken, [learnToEarn.address, creator.address], [TOKEN_1.mul(10), `-${TOKEN_1.mul(10)}`]);

			const course1 = await learnToEarn.getCourseData(courseId1);
			expect(course1.budget).to.equal(TOKEN_1.mul(30));
			expect(course1.budgetAvailable).to.equal(TOKEN_1.mul(10));
		});

		it("Learner 3 complete and receive bonus", async () => {
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId1, learner3.address, timeStarted, currentTimestamp, []))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId1, learner3.address)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, learner3.address], [`-${TOKEN_1.mul(10)}`, TOKEN_1.mul(10)]);

			const course1 = await learnToEarn.getCourseData(courseId1);
			expect(course1.budgetAvailable).to.equal(0);
			expect(course1.totalLearnersClaimedBonus).to.equal(3);

			const timestamp = await getTimestamp();
			const courseLearner3 = await learnToEarn.getLearnerData(courseId1, learner3.address);
			expect(courseLearner3.timeStarted).to.equal(timeStarted);
			expect(courseLearner3.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner3.timeRewarded).to.closeTo(timestamp, 10);
		});


		it("Check balance after flow", async () => {
			const flowName = "flow2";
			await creatorBT.takeSnapshot(flowName);
			await learner1BT.takeSnapshot(flowName);
			await learner2BT.takeSnapshot(flowName);
			await learner3BT.takeSnapshot(flowName);
			await learner4BT.takeSnapshot(flowName);

			const creatorDiff = creatorBT.diff("begin", flowName);
			const learner1Diff = learner1BT.diff("begin", flowName);
			const learner2Diff = learner2BT.diff("begin", flowName);
			const learner3Diff = learner3BT.diff("begin", flowName);

			expect(creatorDiff[iouToken.address].delta).to.equal(`-${TOKEN_1.mul(30)}`);
			expect(learner1Diff[iouToken.address].delta).to.equal(TOKEN_1.mul(10));
			expect(learner2Diff[iouToken.address].delta).to.equal(TOKEN_1.mul(10));
			expect(learner3Diff[iouToken.address].delta).to.equal(TOKEN_1.mul(10));
		});
	});

	describe("Create new course with existed token and specific date bonus (Course 2)", () => {
		let courseId2: string;
		it("Create course 2 with existed token and time bonus to next 45 days", async () => {
			const NEXT_45_DAYS = (await getTimestamp()) + ONE_DAY * 45;
			const tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_1.mul(50), TOKEN_1.mul(10),(await getTimestamp()) + 14, NEXT_45_DAYS, false, true);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId2 = args[0];

			const timestamp = await getTimestamp();
			const course2 = await learnToEarn.getCourseData(courseId2);
			expect(course2.creator).to.equal(creator.address);
			expect(course2.timeCreated).to.closeTo(timestamp + 14, 10);
			expect(course2.rewardAddress).to.equal(iouToken.address);
			expect(course2.budget).to.equal(TOKEN_1.mul(50));
			expect(course2.budgetAvailable).to.equal(TOKEN_1.mul(50));
			expect(course2.bonus).to.equal(TOKEN_1.mul(10));
			expect(course2.timeEndBonus).to.equal(NEXT_45_DAYS);
			expect(course2.isBonusToken).to.be.true;
			expect(course2.isUsingDuration).to.be.false;
			expect(course2.totalLearnersClaimedBonus).to.equal(0);
			expect(course2.canMintNFT).to.be.false;
		});

		it("Learner 1, 2 complete and receive bonus", async () => {
			await skipTime(ONE_DAY);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 14);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId2, learner1.address, timeStarted, currentTimestamp, []))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId2, learner1.address)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, learner1.address], [`-${TOKEN_1.mul(10)}`, TOKEN_1.mul(10)]);

			let course2 = await learnToEarn.getCourseData(courseId2);
			expect(course2.budgetAvailable).to.equal(TOKEN_1.mul(40));
			expect(course2.totalLearnersClaimedBonus).to.equal(1);

			let timestamp = await getTimestamp();
			const courseLearner1 = await learnToEarn.getLearnerData(courseId2, learner1.address);
			expect(courseLearner1.timeStarted).to.equal(timeStarted);
			expect(courseLearner1.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner1.timeRewarded).to.closeTo(timestamp, 10);

			await expect(learnToEarn.connect(creator).completeCourse(courseId2, learner2.address, timeStarted, timestamp, []))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId2, learner2.address)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, learner2.address], [`-${TOKEN_1.mul(10)}`, TOKEN_1.mul(10)]);

			course2 = await learnToEarn.getCourseData(courseId2);
			expect(course2.budgetAvailable).to.equal(TOKEN_1.mul(30));
			expect(course2.totalLearnersClaimedBonus).to.equal(2);

			timestamp = await getTimestamp();
			const courseLearner2 = await learnToEarn.getLearnerData(courseId2, learner2.address);
			expect(courseLearner2.timeStarted).to.equal(timeStarted);
			expect(courseLearner2.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner2.timeRewarded).to.closeTo(timestamp, 10);
		});

		it("Skip 45 days and Learner 3 complete but not receive bonus", async () => {
			await skipTime(ONE_DAY * 45);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId2, learner3.address, timeStarted, currentTimestamp, []))
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId2, learner3.address);

			const course2 = await learnToEarn.getCourseData(courseId2);
			expect(course2.budgetAvailable).to.equal(TOKEN_1.mul(30));
			expect(course2.totalLearnersClaimedBonus).to.equal(2);

			const timestamp = await getTimestamp();
			const courseLearner3 = await learnToEarn.getLearnerData(courseId2, learner3.address);
			expect(courseLearner3.timeStarted).to.equal(timeStarted);
			expect(courseLearner3.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner3.timeRewarded).to.equal(0);
		});

		it("Creator withdraw budget", async () => {
			await expect(learnToEarn.connect(creator).withdrawBudget(courseId2))
				.to.emit(learnToEarn, "WithdrawnBudget")
				.withArgs(courseId2, creator.address, TOKEN_1.mul(30))
				.to.changeTokenBalances(iouToken, [learnToEarn.address, creator.address], [`-${TOKEN_1.mul(30)}`, TOKEN_1.mul(30)]);

			const course2 = await learnToEarn.getCourseData(courseId2);
			expect(course2.budgetAvailable).to.equal(0);
		});

		it("Check balance after flow", async () => {
			const flowName = "flow3";
			await creatorBT.takeSnapshot(flowName);
			await learner1BT.takeSnapshot(flowName);
			await learner2BT.takeSnapshot(flowName);
			await learner3BT.takeSnapshot(flowName);
			await learner4BT.takeSnapshot(flowName);

			const creatorDiff = creatorBT.diff("flow2", flowName);
			const learner1Diff = learner1BT.diff("flow2", flowName);
			const learner2Diff = learner2BT.diff("flow2", flowName);
			const learner3Diff = learner3BT.diff("flow2", flowName);

			expect(creatorDiff[iouToken.address].delta).to.equal(`-${TOKEN_1.mul(20)}`);
			expect(learner1Diff[iouToken.address].delta).to.equal(TOKEN_1.mul(10));
			expect(learner2Diff[iouToken.address].delta).to.equal(TOKEN_1.mul(10));
			expect(learner3Diff[iouToken.address].delta).to.equal(0);
		});
	});

	describe("Create new course with external NFT contract (Course 3)", () => {
		let courseId3: string;
		it("Creator min NFTs", async () => {
			for (let i = 1; i < 6; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}
		});

		it("Create course 3 with external NFT contract and time bonus to next 45 days", async () => {
			const NEXT_45_DAYS = (await getTimestamp()) + ONE_DAY * 45;
			const tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(erc721Test.address, 4, 2,(await getTimestamp()) + 14, NEXT_45_DAYS, false, false);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId3 = args[0];

			const timestamp = await getTimestamp();
			const course3 = await learnToEarn.getCourseData(courseId3);
			expect(course3.creator).to.equal(creator.address);
			expect(course3.timeCreated).to.closeTo(timestamp + 14, 10);
			expect(course3.rewardAddress).to.equal(erc721Test.address);
			expect(course3.budget).to.equal(4);
			expect(course3.budgetAvailable).to.equal(4);
			expect(course3.bonus).to.equal(2);
			expect(course3.timeEndBonus).to.equal(NEXT_45_DAYS);
			expect(course3.isBonusToken).to.be.false;
			expect(course3.isUsingDuration).to.be.false;
			expect(course3.totalLearnersClaimedBonus).to.equal(0);
			expect(course3.canMintNFT).to.be.false;
		});

		it("Learner 1, 2 complete and receive NFT(s)", async () => {
			await erc721Test.connect(creator).setApprovalForAll(learnToEarn.address, true);
			await skipTime(ONE_DAY);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 14);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId3, learner1.address, timeStarted, currentTimestamp, [1, 3]))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId3, learner1.address);

			let course3 = await learnToEarn.getCourseData(courseId3);
			expect(course3.budgetAvailable).to.equal(2);
			expect(course3.totalLearnersClaimedBonus).to.equal(1);

			let timestamp = await getTimestamp();
			const courseLearner1 = await learnToEarn.getLearnerData(courseId3, learner1.address);
			expect(courseLearner1.timeStarted).to.equal(timeStarted);
			expect(courseLearner1.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner1.timeRewarded).to.closeTo(timestamp, 10);

			for (let i = 0; i < courseLearner1.nftIds.length; i++) {
				expect(await erc721Test.ownerOf(courseLearner1.nftIds[i])).to.equal(learner1.address);
			}

			currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId3, learner2.address, timeStarted, currentTimestamp, [2, 4]))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId3, learner2.address);

			course3 = await learnToEarn.getCourseData(courseId3);
			expect(course3.budgetAvailable).to.equal(0);
			expect(course3.totalLearnersClaimedBonus).to.equal(2);

			timestamp = await getTimestamp();
			const courseLearner2 = await learnToEarn.getLearnerData(courseId3, learner2.address);
			expect(courseLearner2.timeStarted).to.equal(timeStarted);
			expect(courseLearner2.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner2.timeRewarded).to.closeTo(timestamp, 10);

			for (let i = 0; i < courseLearner2.nftIds.length; i++) {
				expect(await erc721Test.ownerOf(courseLearner2.nftIds[i])).to.equal(learner2.address);
			}
		});

		it("Learner 3 completed but not receive NFT(s) because of out budget", async () => {
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId3, learner3.address, timeStarted, currentTimestamp, [1, 3]))
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId3, learner3.address);

			let course3 = await learnToEarn.getCourseData(courseId3);
			expect(course3.budgetAvailable).to.equal(0);
			expect(course3.totalLearnersClaimedBonus).to.equal(2);

			const timestamp = await getTimestamp();
			const courseLearner3 = await learnToEarn.getLearnerData(courseId3, learner3.address);
			expect(courseLearner3.timeStarted).to.equal(timeStarted);
			expect(courseLearner3.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner3.timeRewarded).to.equal(0);
		});

		it("Creator add budget to course", async () => {
			for (let i = 6; i < 10; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}

			await learnToEarn.connect(creator).addBudget(courseId3, 2);

			const course1 = await learnToEarn.getCourseData(courseId3);
			expect(course1.budget).to.equal(6);
			expect(course1.budgetAvailable).to.equal(2);
		});

		it("Learner 4 complete and receive NFT(s)", async () => {
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();
			await learnToEarn.connect(creator).completeCourse(courseId3, learner4.address, timeStarted, currentTimestamp, [5, 6]);

			const course3 = await learnToEarn.getCourseData(courseId3);
			expect(course3.budgetAvailable).to.equal(0);
			expect(course3.totalLearnersClaimedBonus).to.equal(3);

			const timestamp = await getTimestamp();
			const courseLearner4 = await learnToEarn.getLearnerData(courseId3, learner4.address);
			expect(courseLearner4.timeStarted).to.equal(timeStarted);
			expect(courseLearner4.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner4.timeRewarded).to.closeTo(timestamp, 10);

			for (let i = 0; i < courseLearner4.nftIds.length; i++) {
				expect(await erc721Test.ownerOf(courseLearner4.nftIds[i])).to.equal(learner4.address);
			}
		});

		it("Creator withdraw budget but reverted", async () => {
			await expect(learnToEarn.connect(creator).withdrawBudget(courseId3)).to.revertedWith("Invalid action");
		});

		it("Check balance after flow", async () => {
			const flowName = "flow4";
			await creatorBT.takeSnapshot(flowName);
			await learner1BT.takeSnapshot(flowName);
			await learner2BT.takeSnapshot(flowName);
			await learner3BT.takeSnapshot(flowName);
			await learner4BT.takeSnapshot(flowName);

			const learner1Diff = learner1BT.diff("flow3", flowName);
			const learner2Diff = learner2BT.diff("flow3", flowName);
			const learner3Diff = learner3BT.diff("flow3", flowName);
			const learner4Diff = learner4BT.diff("flow3", flowName);

			expect(learner1Diff[erc721Test.address].delta).to.equal(2);
			expect(learner2Diff[erc721Test.address].delta).to.equal(2);
			expect(learner3Diff[erc721Test.address].delta).to.equal(0);
			expect(learner4Diff[erc721Test.address].delta).to.equal(2);
		});
	});

	describe("Create new course with NFT contract deployed by system (Course 4)", async () => {
		let courseId4: string;

		it("Create course 4 with NFT contract deployed by system and time duration 60 days", async () => {
			let tx: ContractTransaction = await tokenFactory.deployNFT(nftName, nftSymbol, nftURI);
			let receipt: ContractReceipt = await tx.wait();
			let args: Result = receipt.events!.find(ev => ev.event === "DeployedNFT")!.args!;
			const nftRewardAddress = ethers.utils.getAddress(args[0]);

			tx = await learnToEarn.connect(creator).createCourse(nftRewardAddress, 100, 2,(await getTimestamp()) + 14, ONE_DAY * 60, true, false);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId4 = args[0];

			const timestamp = await getTimestamp();
			const course4 = await learnToEarn.getCourseData(courseId4);
			expect(course4.creator).to.equal(creator.address);
			expect(course4.timeCreated).to.closeTo(timestamp + 14, 10);
			expect(course4.rewardAddress).to.equal(nftRewardAddress);
			expect(course4.budget).to.equal(100);
			expect(course4.budgetAvailable).to.equal(100);
			expect(course4.bonus).to.equal(2);
			expect(course4.timeEndBonus).to.equal(ONE_DAY * 60);
			expect(course4.isBonusToken).to.be.false;
			expect(course4.isUsingDuration).to.be.true;
			expect(course4.totalLearnersClaimedBonus).to.equal(0);
			expect(course4.canMintNFT).to.be.true;

			creatorBT.addToken(nftRewardAddress);
			learner1BT.addToken(nftRewardAddress);
			learner2BT.addToken(nftRewardAddress);
			learner3BT.addToken(nftRewardAddress);
			learner4BT.addToken(nftRewardAddress);

			const flowName = "preflow5";
			await creatorBT.takeSnapshot(flowName);
			await learner1BT.takeSnapshot(flowName);
			await learner2BT.takeSnapshot(flowName);
			await learner3BT.takeSnapshot(flowName);
			await learner4BT.takeSnapshot(flowName);
		});

		it("Learner 1, 2 complete and receive NFT(s)", async () => {
			await skipTime(ONE_DAY);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 14);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId4, learner1.address, timeStarted, currentTimestamp, [1, 3]))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId4, learner1.address);

			let course4 = await learnToEarn.getCourseData(courseId4);
			expect(course4.budgetAvailable).to.equal(98);
			expect(course4.totalLearnersClaimedBonus).to.equal(1);

			let timestamp = await getTimestamp();
			const courseLearner1 = await learnToEarn.getLearnerData(courseId4, learner1.address);
			expect(courseLearner1.timeStarted).to.equal(timeStarted);
			expect(courseLearner1.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner1.timeRewarded).to.closeTo(timestamp, 10);

			const nftRewardContract = new ethers.Contract(course4.rewardAddress, NFTRewardJSON.abi, creator);
			for (let i = 0; i < courseLearner1.nftIds.length; i++) {
				expect(await nftRewardContract.ownerOf(courseLearner1.nftIds[i])).to.equal(learner1.address);
			}

			currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId4, learner2.address, timeStarted, currentTimestamp, [1, 3]))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId4, learner2.address);

			course4 = await learnToEarn.getCourseData(courseId4);
			expect(course4.budgetAvailable).to.equal(96);
			expect(course4.totalLearnersClaimedBonus).to.equal(2);

			timestamp = await getTimestamp();
			const courseLearner2 = await learnToEarn.getLearnerData(courseId4, learner2.address);
			expect(courseLearner2.timeStarted).to.equal(timeStarted);
			expect(courseLearner2.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner2.timeRewarded).to.closeTo(timestamp, 10);

			for (let i = 0; i < courseLearner2.nftIds.length; i++) {
				expect(await nftRewardContract.ownerOf(courseLearner2.nftIds[i])).to.equal(learner2.address);
			}
		});

		it("Learner 3 completed but not receive NFT(s) because out of deadline", async () => {
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 60 + 1);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId4, learner3.address, timeStarted, currentTimestamp, [1, 3]))
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId4, learner3.address);

			let course3 = await learnToEarn.getCourseData(courseId4);
			expect(course3.budgetAvailable).to.equal(96);
			expect(course3.totalLearnersClaimedBonus).to.equal(2);

			const timestamp = await getTimestamp();
			const courseLearner3 = await learnToEarn.getLearnerData(courseId4, learner3.address);
			expect(courseLearner3.timeStarted).to.equal(timeStarted);
			expect(courseLearner3.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner3.timeRewarded).to.equal(0);
		});

		it("Learner 4 complete and receive NFT(s)", async () => {
			await skipTime(ONE_DAY);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 14);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId4, learner4.address, timeStarted, currentTimestamp, [1, 3]))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId4, learner4.address);

			let course4 = await learnToEarn.getCourseData(courseId4);
			expect(course4.budgetAvailable).to.equal(94);
			expect(course4.totalLearnersClaimedBonus).to.equal(3);

			let timestamp = await getTimestamp();
			const courseLearner4 = await learnToEarn.getLearnerData(courseId4, learner4.address);
			expect(courseLearner4.timeStarted).to.equal(timeStarted);
			expect(courseLearner4.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner4.timeRewarded).to.closeTo(timestamp, 10);

			const nftRewardContract = new ethers.Contract(course4.rewardAddress, NFTRewardJSON.abi, creator);
			for (let i = 0; i < courseLearner4.nftIds.length; i++) {
				expect(await nftRewardContract.ownerOf(courseLearner4.nftIds[i])).to.equal(learner4.address);
			}
		});

		it("Creator withdraw budget but reverted", async () => {
			await expect(learnToEarn.connect(creator).withdrawBudget(courseId4)).to.revertedWith("Invalid action");
		});

		it("Check balance after flow", async () => {
			const course = await learnToEarn.getCourseData(courseId4);
			const flowName = "flow5";
			await creatorBT.takeSnapshot(flowName);
			await learner1BT.takeSnapshot(flowName);
			await learner2BT.takeSnapshot(flowName);
			await learner3BT.takeSnapshot(flowName);
			await learner4BT.takeSnapshot(flowName);

			const learner1Diff = learner1BT.diff("preflow5", flowName);
			const learner2Diff = learner2BT.diff("preflow5", flowName);
			const learner3Diff = learner3BT.diff("preflow5", flowName);
			const learner4Diff = learner4BT.diff("preflow5", flowName);

			expect(learner1Diff[course.rewardAddress].delta).to.equal(2);
			expect(learner2Diff[course.rewardAddress].delta).to.equal(2);
			expect(learner3Diff[course.rewardAddress].delta).to.equal(0);
			expect(learner4Diff[course.rewardAddress].delta).to.equal(2);
		});
	});

	describe("Learner completed twice in one course", () => {
		let courseId5: string;
		it("Create course 5 with existed token and time bonus to next 45 days", async () => {
			const NEXT_45_DAYS = (await getTimestamp()) + ONE_DAY * 45;
			const tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_1.mul(50), TOKEN_1.mul(10),(await getTimestamp()) + 14, NEXT_45_DAYS, false, true);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId5 = args[0];

			const timestamp = await getTimestamp();
			const course5 = await learnToEarn.getCourseData(courseId5);
			expect(course5.creator).to.equal(creator.address);
			expect(course5.timeCreated).to.closeTo(timestamp + 14, 10);
			expect(course5.rewardAddress).to.equal(iouToken.address);
			expect(course5.budget).to.equal(TOKEN_1.mul(50));
			expect(course5.budgetAvailable).to.equal(TOKEN_1.mul(50));
			expect(course5.bonus).to.equal(TOKEN_1.mul(10));
			expect(course5.timeEndBonus).to.equal(NEXT_45_DAYS);
			expect(course5.isBonusToken).to.be.true;
			expect(course5.isUsingDuration).to.be.false;
			expect(course5.totalLearnersClaimedBonus).to.equal(0);
			expect(course5.canMintNFT).to.be.false;
		});

		it("Learner 1, 2 complete and receive bonus", async () => {
			await skipTime(ONE_DAY);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 14);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId5, learner1.address, timeStarted, currentTimestamp, []))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId5, learner1.address)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, learner1.address], [`-${TOKEN_1.mul(10)}`, TOKEN_1.mul(10)]);

			let course5 = await learnToEarn.getCourseData(courseId5);
			expect(course5.budgetAvailable).to.equal(TOKEN_1.mul(40));
			expect(course5.totalLearnersClaimedBonus).to.equal(1);

			let timestamp = await getTimestamp();
			const courseLearner1 = await learnToEarn.getLearnerData(courseId5, learner1.address);
			expect(courseLearner1.timeStarted).to.equal(timeStarted);
			expect(courseLearner1.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner1.timeRewarded).to.closeTo(timestamp, 10);

			await expect(learnToEarn.connect(creator).completeCourse(courseId5, learner2.address, timeStarted, timestamp, []))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId5, learner2.address)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, learner2.address], [`-${TOKEN_1.mul(10)}`, TOKEN_1.mul(10)]);

			course5 = await learnToEarn.getCourseData(courseId5);
			expect(course5.budgetAvailable).to.equal(TOKEN_1.mul(30));
			expect(course5.totalLearnersClaimedBonus).to.equal(2);

			timestamp = await getTimestamp();
			const courseLearner2 = await learnToEarn.getLearnerData(courseId5, learner2.address);
			expect(courseLearner2.timeStarted).to.equal(timeStarted);
			expect(courseLearner2.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner2.timeRewarded).to.closeTo(timestamp, 10);
		});

		it("Creator add new budget to course", async () => {
			await learnToEarn.connect(creator).addBudget(courseId5, TOKEN_1.mul(50));

			const course5 = await learnToEarn.getCourseData(courseId5);
			expect(course5.budget).to.equal(TOKEN_1.mul(100));
			expect(course5.budgetAvailable).to.equal(TOKEN_1.mul(80));
		});

		it("Learner 1 complete and receive bonus but reverted", async () => {
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId5, learner1.address, timeStarted, currentTimestamp, [])).to.revertedWith("already completed");
		});

		it("Creator withdraw budget", async () => {
			await skipTime(ONE_DAY * 45 + 1);
			await expect(learnToEarn.connect(creator).withdrawBudget(courseId5))
				.to.emit(learnToEarn, "WithdrawnBudget")
				.withArgs(courseId5, creator.address, TOKEN_1.mul(30))
				.to.changeTokenBalances(iouToken, [learnToEarn.address, creator.address], [`-${TOKEN_1.mul(80)}`, TOKEN_1.mul(80)]);

			const course5 = await learnToEarn.getCourseData(courseId5);
			expect(course5.budgetAvailable).to.equal(0);
		});

		it("Check balance after flow", async () => {
			const flowName = "flow6";
			await creatorBT.takeSnapshot(flowName);
			await learner1BT.takeSnapshot(flowName);
			await learner2BT.takeSnapshot(flowName);
			await learner3BT.takeSnapshot(flowName);
			await learner4BT.takeSnapshot(flowName);

			const creatorDiff = creatorBT.diff("flow5", flowName);
			const learner1Diff = learner1BT.diff("flow5", flowName);
			const learner2Diff = learner2BT.diff("flow5", flowName);

			expect(creatorDiff[iouToken.address].delta).to.equal(`-${TOKEN_1.mul(20)}`);
			expect(learner1Diff[iouToken.address].delta).to.equal(TOKEN_1.mul(10));
			expect(learner2Diff[iouToken.address].delta).to.equal(TOKEN_1.mul(10));
		});
	});

	describe("Creator withdraw after adding budget (Course 6)", async () => {
		let courseId6: string;
		it("Create course 5 with existed token and time bonus to next 45 days", async () => {
			const NEXT_45_DAYS = (await getTimestamp()) + ONE_DAY * 45;
			const tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_1.mul(30), TOKEN_1.mul(10),(await getTimestamp()) + 14, NEXT_45_DAYS, false, true);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId6 = args[0];

			const timestamp = await getTimestamp();
			const course6 = await learnToEarn.getCourseData(courseId6);
			expect(course6.creator).to.equal(creator.address);
			expect(course6.timeCreated).to.closeTo(timestamp + 14, 10);
			expect(course6.rewardAddress).to.equal(iouToken.address);
			expect(course6.budget).to.equal(TOKEN_1.mul(30));
			expect(course6.budgetAvailable).to.equal(TOKEN_1.mul(30));
			expect(course6.bonus).to.equal(TOKEN_1.mul(10));
			expect(course6.timeEndBonus).to.equal(NEXT_45_DAYS);
			expect(course6.isBonusToken).to.be.true;
			expect(course6.isUsingDuration).to.be.false;
			expect(course6.totalLearnersClaimedBonus).to.equal(0);
			expect(course6.canMintNFT).to.be.false;
		});

		it("Learner 1, 2 complete and receive bonus", async () => {
			await skipTime(ONE_DAY);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 14);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId6, learner1.address, timeStarted, currentTimestamp, [])).to.changeTokenBalances(iouToken, [learnToEarn.address, learner1.address], [`-${TOKEN_1.mul(10)}`, TOKEN_1.mul(10)]);

			let course6 = await learnToEarn.getCourseData(courseId6);
			expect(course6.budgetAvailable).to.equal(TOKEN_1.mul(20));
			expect(course6.totalLearnersClaimedBonus).to.equal(1);

			let timestamp = await getTimestamp();
			const courseLearner1 = await learnToEarn.getLearnerData(courseId6, learner1.address);
			expect(courseLearner1.timeStarted).to.equal(timeStarted);
			expect(courseLearner1.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner1.timeRewarded).to.closeTo(timestamp, 10);

			await expect(learnToEarn.connect(creator).completeCourse(courseId6, learner2.address, timeStarted, timestamp, [])).to.changeTokenBalances(iouToken, [learnToEarn.address, learner2.address], [`-${TOKEN_1.mul(10)}`, TOKEN_1.mul(10)]);

			course6 = await learnToEarn.getCourseData(courseId6);
			expect(course6.budgetAvailable).to.equal(TOKEN_1.mul(10));
			expect(course6.totalLearnersClaimedBonus).to.equal(2);

			timestamp = await getTimestamp();
			const courseLearner2 = await learnToEarn.getLearnerData(courseId6, learner2.address);
			expect(courseLearner2.timeStarted).to.equal(timeStarted);
			expect(courseLearner2.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner2.timeRewarded).to.closeTo(timestamp, 10);

			currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId6, learner3.address, timeStarted, currentTimestamp, [])).to.changeTokenBalances(iouToken, [learnToEarn.address, learner3.address], [`-${TOKEN_1.mul(10)}`, TOKEN_1.mul(10)]);

			course6 = await learnToEarn.getCourseData(courseId6);
			expect(course6.budgetAvailable).to.equal(0);
			expect(course6.totalLearnersClaimedBonus).to.equal(3);

			timestamp = await getTimestamp();
			const courseLearner3 = await learnToEarn.getLearnerData(courseId6, learner3.address);
			expect(courseLearner3.timeStarted).to.equal(timeStarted);
			expect(courseLearner3.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner3.timeRewarded).to.closeTo(timestamp, 10);
		});

		it("Creator add budget to course but revert", async () => {
			await skipTime(ONE_DAY * 45 + 1);
			await expect(learnToEarn.connect(creator).withdrawBudget(courseId6)).to.revertedWith("Out of budget");
		});

		it("Creator add new budget to course", async () => {
			await learnToEarn.connect(creator).addBudget(courseId6, TOKEN_1.mul(50));

			const course6 = await learnToEarn.getCourseData(courseId6);
			expect(course6.budget).to.equal(TOKEN_1.mul(80));
			expect(course6.budgetAvailable).to.equal(TOKEN_1.mul(50));
		});

		it("Creator withdraw budget", async () => {
			await expect(learnToEarn.connect(creator).withdrawBudget(courseId6)).to.changeTokenBalances(iouToken, [learnToEarn.address, creator.address], [`-${TOKEN_1.mul(50)}`, TOKEN_1.mul(50)]);

			const course6 = await learnToEarn.getCourseData(courseId6);
			expect(course6.budgetAvailable).to.equal(0);
		});

		it("Check balance after flow", async () => {
			const flowName = "flow7";
			await creatorBT.takeSnapshot(flowName);
			await learner1BT.takeSnapshot(flowName);
			await learner2BT.takeSnapshot(flowName);
			await learner3BT.takeSnapshot(flowName);
			await learner4BT.takeSnapshot(flowName);

			const creatorDiff = creatorBT.diff("flow6", flowName);
			const learner1Diff = learner1BT.diff("flow6", flowName);
			const learner2Diff = learner2BT.diff("flow6", flowName);
			const learner3Diff = learner3BT.diff("flow6", flowName);

			expect(creatorDiff[iouToken.address].delta).to.equal(`-${TOKEN_1.mul(30)}`);
			expect(learner1Diff[iouToken.address].delta).to.equal(TOKEN_1.mul(10));
			expect(learner2Diff[iouToken.address].delta).to.equal(TOKEN_1.mul(10));
			expect(learner3Diff[iouToken.address].delta).to.equal(TOKEN_1.mul(10));
		});
	});

	describe("Creator create course with external NFT contract but have not minted NFT before (Course 7)", () => {
		let courseId7: string;

		it("Create course 7 with external NFT contract and time bonus to next 45 days but reverted because of have not minted NFT before", async () => {
			const NEXT_45_DAYS = (await getTimestamp()) + ONE_DAY * 45;
			await expect(learnToEarn.connect(creator).createCourse(erc721Test.address, 4, 2,(await getTimestamp()) + 14, NEXT_45_DAYS, false, false))
				.to.revertedWith("Insufficient creator's balance");
		});

		it("Creator mint NFTs", async () => {
			// [10, 11, 12, 13]
			for (let i = 1; i < 5; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}
		});

		it("Create course 7", async () => {
			const NEXT_45_DAYS = (await getTimestamp()) + ONE_DAY * 45;
			const tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(erc721Test.address, 4, 2,(await getTimestamp()) + 14, NEXT_45_DAYS, false, false);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId7 = args[0];

			const timestamp = await getTimestamp();
			const course7 = await learnToEarn.getCourseData(courseId7);
			expect(course7.creator).to.equal(creator.address);
			expect(course7.timeCreated).to.closeTo(timestamp + 14, 10);
			expect(course7.rewardAddress).to.equal(erc721Test.address);
			expect(course7.budget).to.equal(4);
			expect(course7.budgetAvailable).to.equal(4);
			expect(course7.bonus).to.equal(2);
			expect(course7.timeEndBonus).to.equal(NEXT_45_DAYS);
			expect(course7.isBonusToken).to.be.false;
			expect(course7.isUsingDuration).to.be.false;
			expect(course7.totalLearnersClaimedBonus).to.equal(0);
			expect(course7.canMintNFT).to.be.false;
		});

		it("Learner 1, 2 complete and receive NFT(s)", async () => {
			await erc721Test.connect(creator).setApprovalForAll(learnToEarn.address, true);
			await skipTime(ONE_DAY);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 14);
			let currentTimestamp = await getTimestamp();
			await learnToEarn.connect(creator).completeCourse(courseId7, learner1.address, timeStarted, currentTimestamp, [10, 12]);

			let course7 = await learnToEarn.getCourseData(courseId7);
			expect(course7.budgetAvailable).to.equal(2);
			expect(course7.totalLearnersClaimedBonus).to.equal(1);

			let timestamp = await getTimestamp();
			const courseLearner1 = await learnToEarn.getLearnerData(courseId7, learner1.address);
			expect(courseLearner1.timeStarted).to.equal(timeStarted);
			expect(courseLearner1.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner1.timeRewarded).to.closeTo(timestamp, 10);

			for (let i = 0; i < courseLearner1.nftIds.length; i++) {
				expect(await erc721Test.ownerOf(courseLearner1.nftIds[i])).to.equal(learner1.address);
			}

			currentTimestamp = await getTimestamp();
			await learnToEarn.connect(creator).completeCourse(courseId7, learner2.address, timeStarted, currentTimestamp, [11, 13]);

			course7 = await learnToEarn.getCourseData(courseId7);
			expect(course7.budgetAvailable).to.equal(0);
			expect(course7.totalLearnersClaimedBonus).to.equal(2);

			timestamp = await getTimestamp();
			const courseLearner2 = await learnToEarn.getLearnerData(courseId7, learner2.address);
			expect(courseLearner2.timeStarted).to.equal(timeStarted);
			expect(courseLearner2.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner2.timeRewarded).to.closeTo(timestamp, 10);

			for (let i = 0; i < courseLearner2.nftIds.length; i++) {
				expect(await erc721Test.ownerOf(courseLearner2.nftIds[i])).to.equal(learner2.address);
			}
		});

		it("Creator add budget but have not minted NFTs", async () => {
			await expect(learnToEarn.connect(creator).addBudget(courseId7, 4)).to.revertedWith("Balance of creator is not enough");
		});

		it("Creator mint NFTs", async () => {
			// [14, 15, 16, 17]
			for (let i = 1; i < 5; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}
		});

		it("Creator add budget", async () => {
			await learnToEarn.connect(creator).addBudget(courseId7, 4);

			const course7 = await learnToEarn.getCourseData(courseId7);
			expect(course7.budget).to.equal(8);
			expect(course7.budgetAvailable).to.equal(4);
		});

		it("Learner 3 complete and receive NFT(s)", async () => {
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 14);
			let currentTimestamp = await getTimestamp();
			await learnToEarn.connect(creator).completeCourse(courseId7, learner3.address, timeStarted, currentTimestamp, [14, 15]);

			let course7 = await learnToEarn.getCourseData(courseId7);
			expect(course7.budgetAvailable).to.equal(2);
			expect(course7.totalLearnersClaimedBonus).to.equal(3);

			let timestamp = await getTimestamp();
			const courseLearner3 = await learnToEarn.getLearnerData(courseId7, learner3.address);
			expect(courseLearner3.timeStarted).to.equal(timeStarted);
			expect(courseLearner3.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner3.timeRewarded).to.closeTo(timestamp, 10);

			for (let i = 0; i < courseLearner3.nftIds.length; i++) {
				expect(await erc721Test.ownerOf(courseLearner3.nftIds[i])).to.equal(learner3.address);
			}
		});

		it("Check balance after flow", async () => {
			const flowName = "flow8";
			await creatorBT.takeSnapshot(flowName);
			await learner1BT.takeSnapshot(flowName);
			await learner2BT.takeSnapshot(flowName);
			await learner3BT.takeSnapshot(flowName);
			await learner4BT.takeSnapshot(flowName);

			const learner1Diff = learner1BT.diff("flow7", flowName);
			const learner2Diff = learner2BT.diff("flow7", flowName);
			const learner3Diff = learner3BT.diff("flow7", flowName);

			expect(learner1Diff[erc721Test.address].delta).to.equal(2);
			expect(learner2Diff[erc721Test.address].delta).to.equal(2);
			expect(learner3Diff[erc721Test.address].delta).to.equal(2);
		});
	});

	describe("Creator create course with external NFT contract but transfer NFTs to other before (Course 8)", async () => {
		let courseId8: string;

		it("Creator mint NFTs", async () => {
			// [18, 19, 20, 21]
			for (let i = 1; i < 5; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}
		});

		it("Create course 8 with external NFT contract and time bonus to next 45 days", async () => {
			const NEXT_45_DAYS = (await getTimestamp()) + ONE_DAY * 45;
			const tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(erc721Test.address, 8, 2,(await getTimestamp()) + 14, NEXT_45_DAYS, false, false);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId8 = args[0];

			const timestamp = await getTimestamp();
			const course8 = await learnToEarn.getCourseData(courseId8);
			expect(course8.creator).to.equal(creator.address);
			expect(course8.timeCreated).to.closeTo(timestamp + 14, 10);
			expect(course8.rewardAddress).to.equal(erc721Test.address);
			expect(course8.budget).to.equal(8);
			expect(course8.budgetAvailable).to.equal(8);
			expect(course8.bonus).to.equal(2);
			expect(course8.timeEndBonus).to.equal(NEXT_45_DAYS);
			expect(course8.isBonusToken).to.be.false;
			expect(course8.isUsingDuration).to.be.false;
			expect(course8.totalLearnersClaimedBonus).to.equal(0);
			expect(course8.canMintNFT).to.be.false;
		});

		it("Creator transfer NFTs to other user", async () => {
			for (let i = 18; i <= 21; i++) {
				await erc721Test.connect(creator).transferFrom(creator.address, learner4.address, i);
			}

			for (let i = 18; i <= 21; i++) {
				expect(await erc721Test.ownerOf(i)).to.equal(learner4.address);
			}
		});

		it("Learner 1 complete and receive NFT(s) but reverted", async () => {
			await erc721Test.connect(creator).setApprovalForAll(learnToEarn.address, true);
			await skipTime(ONE_DAY);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 14);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId8, learner1.address, timeStarted, currentTimestamp, [18, 19])).to.revertedWith("ERC721: caller is not token owner nor approved");
		});

		it("Creator mint new NFTs to transfer to Learner 1", async () => {
			// [22, 23]
			for (let i = 1; i < 3; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}
		});

		it("Transfer NFTs for Learner 1", async () => {
			await erc721Test.connect(creator).setApprovalForAll(learnToEarn.address, true);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();
			await learnToEarn.connect(creator).completeCourse(courseId8, learner1.address, timeStarted, currentTimestamp, [22, 23]);

			let course8 = await learnToEarn.getCourseData(courseId8);
			expect(course8.budgetAvailable).to.equal(6);
			expect(course8.totalLearnersClaimedBonus).to.equal(1);

			let timestamp = await getTimestamp();
			const courseLearner1 = await learnToEarn.getLearnerData(courseId8, learner1.address);
			expect(courseLearner1.timeStarted).to.equal(timeStarted);
			expect(courseLearner1.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner1.timeRewarded).to.closeTo(timestamp, 10);

			for (let i = 0; i < courseLearner1.nftIds.length; i++) {
				expect(await erc721Test.ownerOf(courseLearner1.nftIds[i])).to.equal(learner1.address);
			}
		});

		it("Creator mint new NFTS to add budget but balance is not greater than or equal to budgetAvailable", async () => {
			// [24, 25]
			for (let i = 1; i < 3; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}

			await expect(learnToEarn.connect(creator).addBudget(courseId8, 2)).to.revertedWith("Balance of creator is not enough");
		});

		it("Creator mint new NFTs and add budget", async () => {
			// [26, 27, 28, 29]
			for (let i = 1; i < 5; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}

			await learnToEarn.connect(creator).addBudget(courseId8, 4);

			const course8 = await learnToEarn.getCourseData(courseId8);
			expect(course8.budget).to.equal(12);
			expect(course8.budgetAvailable).to.equal(10);
		});

		it("Learner 2, 3 complete and receive bonus", async () => {
			await erc721Test.connect(creator).setApprovalForAll(learnToEarn.address, true);
			await skipTime(ONE_DAY);
			const timeStarted = await getTimestamp();
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();
			await learnToEarn.connect(creator).completeCourse(courseId8, learner3.address, timeStarted, currentTimestamp, [26, 27]);

			let course8 = await learnToEarn.getCourseData(courseId8);
			expect(course8.budgetAvailable).to.equal(8);
			expect(course8.totalLearnersClaimedBonus).to.equal(2);

			let timestamp = await getTimestamp();
			const courseLearner3 = await learnToEarn.getLearnerData(courseId8, learner3.address);
			expect(courseLearner3.timeStarted).to.equal(timeStarted);
			expect(courseLearner3.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner3.timeRewarded).to.closeTo(timestamp, 10);

			for (let i = 0; i < courseLearner3.nftIds.length; i++) {
				expect(await erc721Test.ownerOf(courseLearner3.nftIds[i])).to.equal(learner3.address);
			}

			currentTimestamp = await getTimestamp();
			await learnToEarn.connect(creator).completeCourse(courseId8, learner2.address, timeStarted, currentTimestamp, [28, 29]);

			course8 = await learnToEarn.getCourseData(courseId8);
			expect(course8.budgetAvailable).to.equal(6);
			expect(course8.totalLearnersClaimedBonus).to.equal(3);

			timestamp = await getTimestamp();
			const courseLearner2 = await learnToEarn.getLearnerData(courseId8, learner2.address);
			expect(courseLearner2.timeStarted).to.equal(timeStarted);
			expect(courseLearner2.timeCompleted).to.closeTo(timestamp, 10);
			expect(courseLearner2.timeRewarded).to.closeTo(timestamp, 10);

			for (let i = 0; i < courseLearner2.nftIds.length; i++) {
				expect(await erc721Test.ownerOf(courseLearner2.nftIds[i])).to.equal(learner2.address);
			}
		});

		it("Check balance after flow", async () => {
			const flowName = "flow9";
			await creatorBT.takeSnapshot(flowName);
			await learner1BT.takeSnapshot(flowName);
			await learner2BT.takeSnapshot(flowName);
			await learner3BT.takeSnapshot(flowName);
			await learner4BT.takeSnapshot(flowName);

			const learner1Diff = learner1BT.diff("flow8", flowName);
			const learner2Diff = learner2BT.diff("flow8", flowName);
			const learner3Diff = learner3BT.diff("flow8", flowName);

			expect(learner1Diff[erc721Test.address].delta).to.equal(2);
			expect(learner2Diff[erc721Test.address].delta).to.equal(2);
			expect(learner3Diff[erc721Test.address].delta).to.equal(2);
		});
	});
});

