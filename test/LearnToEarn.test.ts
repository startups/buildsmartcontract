import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits, formatBytes32String } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LearnToEarn, LearnToEarn__factory, IOUToken, IOUToken__factory, TokenFactory, TokenFactory__factory, NFTReward, NFTReward__factory, ERC721Test, ERC721Test__factory } from "../typechain-types";
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
let erc721Test: ERC721Test;

let learner1: SignerWithAddress;
let learner2: SignerWithAddress;
let iouToken: IOUToken;

const TOKEN_1 = parseUnits("1", 18);
const TOKEN_50 = parseUnits("50", 18);
const TOKEN_100 = parseUnits("100", 18);
const ONE_DAY = 24 * 60 * 60;
const tokenName = "Pioneer",
	tokenSymbol = "PIO";
const nftName = "Pioneer Certificate",
	nftSymbol = "PICE",
	nftURI = "https://ipfs.io/ipfs/QmNZiPk974vDsPmQii3YbrMKfi12KTSNM7XMiYyiea4VYZ/example";
let timeStart: number;

describe("LearnToEarn contract", () => {
	beforeEach(async () => {
		[deployer, creator, learner1, learner2, ...accounts] = await ethers.getSigners();
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
		timeStart = (await getTimestamp()) + ONE_DAY;
	});

	it("Validate initialized state of contracts", async () => {
		expect(await learnToEarn.owner()).to.equal(deployer.address);
	});

	it("[Fail]: Initializable: contract is already initialized", async () => {
		await expect(learnToEarn.initialize()).to.revertedWith("Initializable: contract is already initialized");
	});

	describe("Testing `createCourse` function", () => {
		it("[Fail]: Zero budget", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			await expect(learnToEarn.connect(creator).createCourse(nftReward.address, 0, 1, timeStart, NEXT_60_DAYS, false, false)).to.revertedWith("Zero amount");
		});

		it("[Fail]: Zero bonus", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			await expect(learnToEarn.connect(creator).createCourse(nftReward.address, 100, 0, timeStart, NEXT_60_DAYS, false, false)).to.revertedWith("Zero amount");
		});

		it("[Fail]: Invalid time start", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			await expect(learnToEarn.connect(creator).createCourse(nftReward.address, 100, 1, timeStart - ONE_DAY - 1, NEXT_60_DAYS, false, false)).to.revertedWith("Invalid time start");
		});

		it("[Fail]: Invalid rewardAddress address", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			await expect(learnToEarn.connect(creator).createCourse(ZERO_ADDRESS, 100, 1, timeStart, NEXT_60_DAYS, false, false)).to.revertedWith("Invalid reward address");
		});

		it("[Fail]: Invalid rewardAddress address", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			await expect(learnToEarn.connect(creator).createCourse(nftReward.address, 2, 3, timeStart, NEXT_60_DAYS, false, false)).to.revertedWith("Invalid budget");
		});

		it("[Fail]: Create new course with existed token that has not been approved to transfer", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			await expect(learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, timeStart, ONE_DAY * 60, true, true)).to.revertedWith("ERC20: insufficient allowance");
			await expect(learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, timeStart, NEXT_60_DAYS, false, true)).to.revertedWith("ERC20: insufficient allowance");
		});

		it("[Fail]: Creator with external nft contract but balance of creator is not enough", async () => {
			await expect(learnToEarn.connect(creator).createCourse(erc721Test.address, 20, 1, timeStart, ONE_DAY * 60, true, false)).to.revertedWith("Insufficient creator's balance");
		});

		it("[Fail]: Invalid time end bonus", async () => {
			await iouToken.connect(creator).approve(learnToEarn.address, MAX_UINT256);
			await expect(learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_1.mul(20), TOKEN_1, timeStart, 0, true, true)).to.revertedWith("Invalid time end bonus");
			await expect(learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_1.mul(20), TOKEN_1, timeStart, timeStart - 1, false, true)).to.revertedWith("Invalid time end bonus");
		});

		it("[OK]: Create course with bonus is nft that is deployed by system successfully", async () => {
			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			let tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(nftReward.address, 100, 1, timeStart, NEXT_60_DAYS, false, false);
			let receipt: ContractReceipt = await tx.wait();
			let args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			let courseId = args[0];

			let course = await learnToEarn.getCourseData(courseId);

			expect(course.creator).to.equal(creator.address);
			expect(course.rewardAddress).to.equal(nftReward.address);
			expect(course.budget).to.equal(100);
			expect(course.budgetAvailable).to.equal(100);
			expect(course.bonus).to.equal(1);
			expect(course.timeCreated).to.closeTo(timeStart, 10);
			expect(course.timeEndBonus).to.equal(NEXT_60_DAYS);
			expect(course.isBonusToken).to.false;
			expect(course.canMintNFT).to.true;

			tx = await learnToEarn.connect(creator).createCourse(nftReward.address, 100, 1, 0, 0, false, false);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId = args[0];

			course = await learnToEarn.getCourseData(courseId);
			timeStart = await getTimestamp();
			expect(course.creator).to.equal(creator.address);
			expect(course.rewardAddress).to.equal(nftReward.address);
			expect(course.budget).to.equal(100);
			expect(course.budgetAvailable).to.equal(100);
			expect(course.bonus).to.equal(1);
			expect(course.timeCreated).to.closeTo(timeStart, 10);
			expect(course.timeEndBonus).to.equal(0);
			expect(course.isBonusToken).to.false;
			expect(course.canMintNFT).to.true;
		});

		it("[OK]: Create course with bonus is external nft contract", async () => {
			for (let i = 0; i < 6; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}

			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			const tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(erc721Test.address, 5, 1, timeStart, NEXT_60_DAYS, false, false);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			const courseId = args[0];

			const course = await learnToEarn.getCourseData(courseId);
			expect(course.creator).to.equal(creator.address);
			expect(course.rewardAddress).to.equal(erc721Test.address);
			expect(course.budget).to.equal(5);
			expect(course.budgetAvailable).to.equal(5);
			expect(course.bonus).to.equal(1);
			expect(course.timeCreated).to.closeTo(timeStart, 10);
			expect(course.timeEndBonus).to.equal(NEXT_60_DAYS);
			expect(course.isBonusToken).to.false;
			expect(course.canMintNFT).to.false;
		});

		it("[OK]: Create course with bonus is token successfully", async () => {
			await iouToken.connect(creator).approve(learnToEarn.address, MAX_UINT256);

			const tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, timeStart, ONE_DAY * 60, true, true);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			const courseId = args[0];

			const course = await learnToEarn.getCourseData(courseId);
			expect(course.creator).to.equal(creator.address);
			expect(course.rewardAddress).to.equal(iouToken.address);
			expect(course.budget).to.equal(TOKEN_100);
			expect(course.budgetAvailable).to.equal(TOKEN_100);
			expect(course.bonus).to.equal(TOKEN_1);
			expect(course.timeCreated).to.equal(timeStart);
			expect(course.timeEndBonus).to.equal(ONE_DAY * 60);
			expect(course.isBonusToken).to.true;
			expect(course.canMintNFT).to.false;
			expect(await iouToken.balanceOf(learnToEarn.address)).to.equal(TOKEN_100);
		});
	});

	describe("Testing `addBudget` function", () => {
		let courseId1: string;
		let courseId2: string;
		let courseId3: string;
		beforeEach(async () => {
			timeStart = (await getTimestamp()) + ONE_DAY;
			await iouToken.connect(creator).approve(learnToEarn.address, MAX_UINT256);

			let tx: ContractTransaction = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, timeStart, ONE_DAY * 60, true, true);
			let receipt: ContractReceipt = await tx.wait();
			let args: Result = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId1 = args[0];

			for (let i = 0; i < 6; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}

			const NEXT_60_DAYS = Date.now() + ONE_DAY * 60;
			tx = await learnToEarn.connect(creator).createCourse(erc721Test.address, 5, 1, timeStart, NEXT_60_DAYS, false, false);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId2 = args[0];

			tx = await learnToEarn.connect(creator).createCourse(nftReward.address, 100, 1, timeStart, NEXT_60_DAYS, false, false);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId3 = args[0];
		});

		it("[Fail]: Caller is not creator", async () => {
			await expect(learnToEarn.connect(learner1).addBudget(courseId1, TOKEN_50)).to.revertedWith("caller is not course creator");
		});

		it("[Fail]: Add zero budget", async () => {
			await expect(learnToEarn.connect(creator).addBudget(courseId1, 0)).to.revertedWith("Zero amount");
		});

		it("[Fail]: Add budget NFTs but balance of creator is not enough", async () => {
			await expect(learnToEarn.connect(creator).addBudget(courseId2, 4)).to.revertedWith("Balance of creator is not enough");
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
			for (let i = 0; i < 20; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}

			await expect(learnToEarn.connect(creator).addBudget(courseId2, 15))
				.to.emit(learnToEarn, "AddedBudget")
				.withArgs(courseId2, 15);
			const course2 = await learnToEarn.getCourseData(courseId2);
			expect(course2.budget).to.equal(20);
			expect(course2.budgetAvailable).to.equal(20);

			await expect(learnToEarn.connect(creator).addBudget(courseId3, 15))
				.to.emit(learnToEarn, "AddedBudget")
				.withArgs(courseId3, 15);
			const course3 = await learnToEarn.getCourseData(courseId3);
			expect(course3.budget).to.equal(115);
			expect(course3.budgetAvailable).to.equal(115);
		});
	});

	describe("Testing `completeCourse` function", () => {
		let courseId1: string;
		let courseId2: string;
		let courseId3: string;
		let timeStart: number;
		beforeEach(async () => {
			await tokenFactory.setLearnToEarn(learnToEarn.address);
			let tx: ContractTransaction = await tokenFactory.deployNFT(nftName, nftSymbol, nftURI);
			let receipt: ContractReceipt = await tx.wait();
			let args: Result = receipt.events!.find(ev => ev.event === "DeployedNFT")!.args!;
			const nftRewardAddress = ethers.utils.getAddress(args[0]);

			await iouToken.connect(creator).approve(learnToEarn.address, MAX_UINT256);

			tx = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, (await getTimestamp()) + 14, ONE_DAY * 60, true, true);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId1 = args[0];

			const NEXT_30_DAYS = (await getTimestamp()) + ONE_DAY * 30;
			tx = await learnToEarn.connect(creator).createCourse(nftRewardAddress, 100, 2, (await getTimestamp()) + 14, NEXT_30_DAYS, false, false);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId2 = args[0];

			for (let i = 0; i < 20; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}

			tx = await learnToEarn.connect(creator).createCourse(erc721Test.address, 20, 3, (await getTimestamp()) + 14, NEXT_30_DAYS, false, false);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId3 = args[0];

			timeStart = (await getTimestamp()) + ONE_DAY;
		});

		it("[Fail]: Caller is not course creator", async () => {
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(learner1).completeCourse(courseId1, learner1.address, timeStart, currentTimestamp, [])).to.revertedWith("caller is not course creator");
			currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(formatBytes32String("test"), learner1.address, timeStart, currentTimestamp, [])).to.revertedWith("caller is not course creator");
		});

		it("[Fail]: Invalid time start", async () => {
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId1, learner1.address, Date.now(), currentTimestamp, [])).to.revertedWith("Invalid time start");
		});

		it("[Fail]: Already completed", async () => {
			await skipTime(10 * ONE_DAY);
			let currentTimestamp = await getTimestamp();
			await learnToEarn.connect(creator).completeCourse(courseId1, learner1.address, timeStart, currentTimestamp, []);
			await expect(learnToEarn.connect(creator).completeCourse(courseId1, learner1.address, timeStart, currentTimestamp, [])).to.revertedWith("already completed");
		});

		it("[Fail]: NFTs to reward is not enough", async () => {
			await skipTime(10 * ONE_DAY);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId3, learner1.address, timeStart, currentTimestamp, [])).to.revertedWith("Not enough NFTs");
		});

		it("[Fail]: ERC721: caller is not token owner nor approved", async () => {
			await skipTime(10 * ONE_DAY);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).completeCourse(courseId3, learner1.address, timeStart, currentTimestamp, [1, 6, 7])).to.revertedWith("ERC721: caller is not token owner nor approved");
			await expect(learnToEarn.connect(creator).completeCourse(courseId3, learner1.address, timeStart, currentTimestamp, [1, 2, 3])).to.revertedWith("ERC721: caller is not token owner nor approved");
		});

		it("[OK]: Complete course with token awards successfully", async () => {
			await skipTime(10 * ONE_DAY);
			let currentTimestamp = await getTimestamp();
			let course1 = await learnToEarn.getCourseData(courseId1);
			let learner = await learnToEarn.getLearnerData(courseId1, learner1.address);
			await expect(learnToEarn.connect(creator).completeCourse(courseId1, learner1.address, timeStart, currentTimestamp, []))
				.to.emit(learnToEarn, "ClaimedReward")
				.withArgs(courseId1, learner1.address, course1.rewardAddress, course1.bonus, learner.nftIds)
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
			currentTimestamp = await getTimestamp();

			await learnToEarn.connect(creator).completeCourse(courseId1, learner2.address, timeStart + ONE_DAY * 9 - 1, currentTimestamp, []);
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

		it("[OK]: Complete course with nft deployed by system awards successfully", async () => {
			await skipTime(10 * ONE_DAY);
			let currentTimestamp = await getTimestamp();
			let course2 = await learnToEarn.getCourseData(courseId2);
			await expect(learnToEarn.connect(creator).completeCourse(courseId2, learner1.address, timeStart, currentTimestamp, []))
				.to.emit(learnToEarn, "ClaimedReward")
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

		it("[OK]: Complete course with external nft awards successfully", async () => {
			await erc721Test.connect(creator).setApprovalForAll(learnToEarn.address, true);
			await skipTime(10 * ONE_DAY);
			let currentTimestamp = await getTimestamp();
			let course3 = await learnToEarn.getCourseData(courseId3);
			await expect(learnToEarn.connect(creator).completeCourse(courseId3, learner1.address, timeStart, currentTimestamp, [1, 4, 6]))
				.to.emit(learnToEarn, "ClaimedReward")
				.to.emit(learnToEarn, "CompletedCourse")
				.withArgs(courseId3, learner1.address);

			course3 = await learnToEarn.getCourseData(courseId3);
			expect(course3.budgetAvailable).to.equal(17);
			expect(course3.totalLearnersClaimedBonus).to.equal(1);

			const firstLearner = await learnToEarn.getLearnerData(courseId3, learner1.address);
			let timestamp = await getTimestamp();
			expect(firstLearner.timeStarted).to.equal(timeStart);
			expect(firstLearner.timeCompleted).to.closeTo(timestamp, 10);
			expect(firstLearner.timeRewarded).to.closeTo(timestamp, 10);
			expect(firstLearner.nftIds.length).to.equal(course3.bonus);

			for (let i = 0; i < firstLearner.nftIds.length; i++) {
				expect(await erc721Test.ownerOf(firstLearner.nftIds[i])).to.equal(learner1.address);
			}

			await skipTime(10 * ONE_DAY);
			currentTimestamp = await getTimestamp();
			await learnToEarn.connect(creator).completeCourse(courseId3, learner2.address, timeStart, currentTimestamp, [2, 3, 5]);
			course3 = await learnToEarn.getCourseData(courseId3);
			expect(course3.budgetAvailable).to.equal(14);
			expect(course3.totalLearnersClaimedBonus).to.equal(2);

			const secondLearner = await learnToEarn.getLearnerData(courseId3, learner2.address);
			timestamp = await getTimestamp();
			expect(secondLearner.timeStarted).to.equal(timeStart);
			expect(secondLearner.timeCompleted).to.closeTo(timestamp, 10);
			expect(secondLearner.timeRewarded).to.closeTo(timestamp, 10);
			expect(secondLearner.nftIds.length).to.equal(course3.bonus);

			for (let i = 0; i < secondLearner.nftIds.length; i++) {
				expect(await erc721Test.ownerOf(secondLearner.nftIds[i])).to.equal(learner2.address);
			}
		});
	});

	describe("Testing `withdrawBudget` function", () => {
		let courseId1: string;
		let courseId2: string;
		let courseId3: string;
		let timeStart: number;
		beforeEach(async () => {
			await tokenFactory.setLearnToEarn(learnToEarn.address);
			let tx: ContractTransaction = await tokenFactory.deployNFT(nftName, nftSymbol, nftURI);
			let receipt: ContractReceipt = await tx.wait();
			let args: Result = receipt.events!.find(ev => ev.event === "DeployedNFT")!.args!;

			await iouToken.connect(creator).approve(learnToEarn.address, MAX_UINT256);

			tx = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, (await getTimestamp()) + 14, ONE_DAY * 60, true, true);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId1 = args[0];

			const NEXT_30_DAYS = (await getTimestamp()) + ONE_DAY * 30;
			tx = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_1.mul(2), TOKEN_1, (await getTimestamp()) + 14, NEXT_30_DAYS, false, true);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId2 = args[0];

			for (let i = 0; i < 20; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}

			tx = await learnToEarn.connect(creator).createCourse(erc721Test.address, 20, 3, (await getTimestamp()) + 14, NEXT_30_DAYS, false, false);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId3 = args[0];

			timeStart = (await getTimestamp()) + ONE_DAY;
		});

		it("[Fail]: Caller is not the creator of course", async () => {
			await expect(learnToEarn.connect(learner1).withdrawBudget(courseId1)).to.revertedWith("caller is not course creator");
		});

		it("[Fail]: Withdraw a course that bonus is nft", async () => {
			await expect(learnToEarn.connect(creator).withdrawBudget(courseId3)).to.revertedWith("Invalid action");
		});

		it("[Fail]: Withdraw but time bonus has not ended", async () => {
			await skipTime(ONE_DAY * 10 - 1);
			await expect(learnToEarn.connect(creator).withdrawBudget(courseId2)).to.revertedWith("Time bonus has not ended");
		});

		it("[Fail]: Withdraw but out of budget", async () => {
			timeStart = (await getTimestamp()) + ONE_DAY;
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();
			await learnToEarn.connect(creator).completeCourse(courseId2, learner1.address, timeStart, currentTimestamp, []);
			await learnToEarn.connect(creator).completeCourse(courseId2, learner2.address, timeStart, currentTimestamp, []);
			await skipTime(ONE_DAY * 20 + 1);
			await expect(learnToEarn.connect(creator).withdrawBudget(courseId2)).to.revertedWith("Out of budget");
		});

		it("[OK]: Withdraw successfully", async () => {
			timeStart = (await getTimestamp()) + ONE_DAY;
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();

			await learnToEarn.connect(creator).completeCourse(courseId2, learner1.address, timeStart, currentTimestamp, []);
			await skipTime(ONE_DAY * 20 + 1);

			await expect(learnToEarn.connect(creator).withdrawBudget(courseId1))
				.to.emit(learnToEarn, "WithdrawnBudget")
				.withArgs(courseId1, creator.address, TOKEN_100)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, creator.address], [`-${TOKEN_100}`, TOKEN_100]);

			let course = await learnToEarn.getCourseData(courseId1);
			expect(course.budgetAvailable).to.equal(0);

			await expect(learnToEarn.connect(creator).withdrawBudget(courseId2))
				.to.emit(learnToEarn, "WithdrawnBudget")
				.withArgs(courseId2, creator.address, TOKEN_1)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, creator.address], [`-${TOKEN_1}`, TOKEN_1]);

			course = await learnToEarn.getCourseData(courseId2);
			expect(course.budgetAvailable).to.equal(0);
		});
	});

	describe("removeCourse", () => {
		let courseId1: string;
		let courseId2: string;
		let courseId3: string;
		let timeStart: number;
		beforeEach(async () => {
			await tokenFactory.setLearnToEarn(learnToEarn.address);
			let tx: ContractTransaction = await tokenFactory.deployNFT(nftName, nftSymbol, nftURI);
			let receipt: ContractReceipt = await tx.wait();
			let args: Result = receipt.events!.find(ev => ev.event === "DeployedNFT")!.args!;

			await iouToken.connect(creator).approve(learnToEarn.address, MAX_UINT256);

			tx = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, (await getTimestamp()) + 14, ONE_DAY * 60, true, true);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId1 = args[0];

			const NEXT_30_DAYS = (await getTimestamp()) + ONE_DAY * 30;
			tx = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_1.mul(2), TOKEN_1.mul(2), (await getTimestamp()) + 14, NEXT_30_DAYS, false, true);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId2 = args[0];

			for (let i = 0; i < 20; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}

			tx = await learnToEarn.connect(creator).createCourse(erc721Test.address, 20, 3, (await getTimestamp()) + 14, NEXT_30_DAYS, false, false);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId3 = args[0];

			timeStart = (await getTimestamp()) + ONE_DAY;
		});

		it("[Fail]: Caller is not the creator of course", async () => {
			await expect(learnToEarn.connect(learner1).removeCourse(courseId1)).to.revertedWith("caller is not course creator");
		});

		it("[Fail]: Course has been removed", async () => {
			await learnToEarn.connect(creator).removeCourse(courseId1);
			await expect(learnToEarn.connect(creator).removeCourse(courseId1)).to.revertedWith("Course has been removed");
		});

		it("[OK]: Remove course successfully", async () => {
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();
			await expect(learnToEarn.connect(creator).removeCourse(courseId1))
				.to.emit(learnToEarn, "RemovedCourse")
				.withArgs(courseId1, creator.address)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, creator.address], [TOKEN_100.mul(-1), TOKEN_100]);

			let course = await learnToEarn.getCourseData(courseId1);
			let timestamp = await getTimestamp();
			expect(course.budgetAvailable).to.equal(0);
			expect(course.timeRemoved).to.closeTo(timestamp, 10);

			await learnToEarn.connect(creator).completeCourse(courseId2, learner1.address, timeStart, currentTimestamp, []);
			await expect(learnToEarn.connect(creator).removeCourse(courseId2))
				.to.emit(learnToEarn, "RemovedCourse")
				.withArgs(courseId2, creator.address)
				.to.changeTokenBalances(iouToken, [learnToEarn.address, creator.address], [0, 0]);

			course = await learnToEarn.getCourseData(courseId2);
			timestamp = await getTimestamp();
			expect(course.budgetAvailable).to.equal(0);
			expect(course.timeRemoved).to.closeTo(timestamp, 10);

			await expect(learnToEarn.connect(creator).removeCourse(courseId3))
				.to.emit(learnToEarn, "RemovedCourse")
				.withArgs(courseId3, creator.address);

			course = await learnToEarn.getCourseData(courseId3);
			timestamp = await getTimestamp();
			expect(course.budgetAvailable).to.equal(0);
			expect(course.timeRemoved).to.closeTo(timestamp, 10);
		});
	});

	describe("canGetBonus", () => {
		let courseId1: string;
		let courseId2: string;
		let courseId3: string;
		let timeStart: number;
		beforeEach(async () => {
			await tokenFactory.setLearnToEarn(learnToEarn.address);
			let tx: ContractTransaction = await tokenFactory.deployNFT(nftName, nftSymbol, nftURI);
			let receipt: ContractReceipt = await tx.wait();
			let args: Result = receipt.events!.find(ev => ev.event === "DeployedNFT")!.args!;

			await iouToken.connect(creator).approve(learnToEarn.address, MAX_UINT256);

			tx = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_100, TOKEN_1, (await getTimestamp()) + 14, ONE_DAY * 60, true, true);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId1 = args[0];

			const NEXT_30_DAYS = (await getTimestamp()) + ONE_DAY * 30;
			tx = await learnToEarn.connect(creator).createCourse(iouToken.address, TOKEN_1.mul(2), TOKEN_1, (await getTimestamp()) + 14, NEXT_30_DAYS, false, true);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId2 = args[0];

			for (let i = 0; i < 20; i++) {
				await erc721Test.connect(deployer).mintNFT(creator.address, nftURI);
			}

			tx = await learnToEarn.connect(creator).createCourse(erc721Test.address, 20, 3, (await getTimestamp()) + 14, 0, false, false);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedCourse")!.args!;
			courseId3 = args[0];

			timeStart = (await getTimestamp()) + ONE_DAY;
		});

		it('[OK]: should return false', async () => {
			timeStart = (await getTimestamp()) + ONE_DAY;
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();

			await learnToEarn.connect(creator).completeCourse(courseId2, learner1.address, timeStart, currentTimestamp, []);
			expect(await learnToEarn.canGetBonus(courseId2, learner1.address, currentTimestamp)).to.be.false;

			await learnToEarn.connect(creator).completeCourse(courseId2, learner2.address, timeStart, currentTimestamp, []);
			await skipTime(ONE_DAY * 20 + 1);
			currentTimestamp = await getTimestamp();

			expect(await learnToEarn.canGetBonus(courseId2, accounts[0].address, currentTimestamp)).to.be.false;
		});

		it("[OK]: Should return true", async () => {
			timeStart = (await getTimestamp()) + ONE_DAY;
			await skipTime(ONE_DAY * 10);
			let currentTimestamp = await getTimestamp();
			expect(await learnToEarn.canGetBonus(courseId3, accounts[0].address, currentTimestamp)).to.be.true;
		});
	});
});
