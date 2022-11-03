import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ReBakedDAO, ReBakedDAO__factory, TokenFactory, TokenFactory__factory, IOUToken, IOUToken__factory } from "../../typechain-types";
import { Result } from "@ethersproject/abi";
import { ContractReceipt, ContractTransaction } from "ethers";
import { MAX_UINT256, getTimestamp, skipTime, BalanceTracker as BT } from "../utils";

// Contract Factories
let owner: SignerWithAddress;
let treasury: SignerWithAddress;
let accounts: SignerWithAddress[];
let reBakedDAO: ReBakedDAO;
let tokenFactory: TokenFactory;
let iouToken: IOUToken;

// Useful variables
const TOKEN_5 = parseUnits("5", 18);
const TOKEN_10 = parseUnits("10", 18);
const TOKEN_20 = parseUnits("20", 18);
const TOKEN_30 = parseUnits("30", 18);
const TOKEN_40 = parseUnits("40", 18);
const TOKEN_50 = parseUnits("50", 18);
const TOKEN_100 = parseUnits("100", 18);
const TOKEN_1000 = parseUnits("1000", 18);
const ONE_DAY = 1 * 24 * 60 * 60;
const TWO_DAYS = 2 * 24 * 60 * 60;
const THREE_DAYS = 3 * 24 * 60 * 60;

let projectId1: string, projectId2: string;
let initiator: SignerWithAddress;
let collaborator1: SignerWithAddress;
let collaborator2: SignerWithAddress;
let collaborator3: SignerWithAddress;
let observer1: SignerWithAddress;
let observer2: SignerWithAddress;
let tx: ContractTransaction;
let receipt: ContractReceipt;

let treasuryBT: BT, initiatorBT: BT;
let collaborator1BT: BT, collaborator2BT: BT, collaborator3BT: BT;
let observer1BT: BT, observer2BT: BT;

describe.only("ReBakedDAO", () => {
	before(async () => {
		[owner, treasury, initiator, collaborator1, collaborator2, collaborator3, observer1, observer2, ...accounts] = await ethers.getSigners();

		const TokenFactory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
		const IOUToken = (await ethers.getContractFactory("IOUToken")) as IOUToken__factory;
		const ReBakedDAO = (await ethers.getContractFactory("ReBakedDAO")) as ReBakedDAO__factory;

		tokenFactory = (await upgrades.deployProxy(TokenFactory, [])) as TokenFactory;
		iouToken = await IOUToken.deploy(initiator.address, "10000000000000000000000");
		reBakedDAO = (await upgrades.deployProxy(ReBakedDAO, [treasury.address, tokenFactory.address])) as ReBakedDAO;
		await reBakedDAO.deployed();

		await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);

		// Early transactions
		await tokenFactory.setReBakedDao(reBakedDAO.address);

		treasuryBT = new BT(treasury.address, [iouToken.address]);
		initiatorBT = new BT(initiator.address, [iouToken.address]);
		collaborator1BT = new BT(collaborator1.address, [iouToken.address]);
		collaborator2BT = new BT(collaborator2.address, [iouToken.address]);
		collaborator3BT = new BT(collaborator3.address, [iouToken.address]);
		observer1BT = new BT(observer1.address, [iouToken.address]);
		observer2BT = new BT(observer2.address, [iouToken.address]);

		treasuryBT.takeSnapshot("begin");
		initiatorBT.takeSnapshot("begin");
		collaborator1BT.takeSnapshot("begin");
		collaborator2BT.takeSnapshot("begin");
		collaborator3BT.takeSnapshot("begin");
		observer1BT.takeSnapshot("begin");
		observer2BT.takeSnapshot("begin");
	});

	describe("Verify contract parameter", () => {
		// Verify contract parameters
		it("Verify TokenFactory contract parameters", async () => {
			expect(await tokenFactory.reBakedDao()).to.equal(reBakedDAO.address);
		});

		it("Verify RebakedDAO contract parameters", async () => {
			expect(await reBakedDAO.treasury()).to.equal(treasury.address);
			expect(await reBakedDAO.tokenFactory()).to.equal(tokenFactory.address);
		});
	});

	describe("Start project with existed token (Project 1, Package 1)", async () => {
		let packageId1: string;
		it("Create project 1 with existed token", async () => {
			let tx: ContractTransaction = await BT.updateFee(reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000));
			let receipt: ContractReceipt = await tx.wait();
			projectId1 = receipt.events!.find(ev => ev.event === "CreatedProject")!.args![0];

			let project1 = await reBakedDAO.getProjectData(projectId1);
			let currentTime = await getTimestamp();
			expect(project1.token).to.equal(iouToken.address);
			expect(project1.isOwnToken).to.be.true;
			expect(project1.budget).to.equal(TOKEN_1000);
			expect(project1.timeCreated).to.closeTo(currentTime, 10);
			expect(project1.timeApproved).to.closeTo(currentTime, 10);
			expect(project1.timeStarted).to.closeTo(currentTime, 10);
		});

		it("Add package 1", async () => {
			tx = await BT.updateFee(reBakedDAO.connect(initiator).createPackage(projectId1, TOKEN_100, TOKEN_10, TOKEN_40, 3));
			receipt = await tx.wait();
			packageId1 = receipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(TOKEN_50.add(TOKEN_100));
			expect(project1.totalPackages).to.equal(1);

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			const currentTime = await getTimestamp();
			expect(package1.budget).to.equal(TOKEN_100);
			expect(package1.bonus).to.equal(TOKEN_10);
			expect(package1.budgetObservers).to.equal(TOKEN_40);
			expect(package1.maxCollaborators).to.equal(3);
			expect(package1.isActive).to.be.true;
			expect(package1.timeCreated).to.closeTo(currentTime, 10);
		});

		it("Add 2 collaborators", async () => {
			await BT.expect(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId1, collaborator1.address, TOKEN_10))
				.to.emit(reBakedDAO, "AddedCollaborator")
				.withArgs(projectId1, packageId1, collaborator1.address, TOKEN_10);

			await BT.expect(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId1, collaborator2.address, TOKEN_10.add(TOKEN_5)))
				.to.emit(reBakedDAO, "AddedCollaborator")
				.withArgs(projectId1, packageId1, collaborator2.address, TOKEN_10.add(TOKEN_5));

			const currentTime = await getTimestamp();
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator2.address);
			expect(addedCollaborator1.mgp).to.equal(TOKEN_10);
			expect(addedCollaborator1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.mgp).to.equal(TOKEN_10.add(TOKEN_5));
			expect(addedCollaborator2.timeCreated).to.closeTo(currentTime, 10);

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			expect(package1.budgetAllocated).to.equal(TOKEN_20.add(TOKEN_5));
			expect(package1.totalCollaborators).to.equal(2);
		});

		it("Approve 2 collaborators", async () => {
			await BT.expect(reBakedDAO.connect(initiator).approveCollaborator(projectId1, packageId1, collaborator1.address))
				.to.emit(reBakedDAO, "ApprovedCollaborator")
				.withArgs(projectId1, packageId1, collaborator1.address);

			await BT.expect(reBakedDAO.connect(initiator).approveCollaborator(projectId1, packageId1, collaborator2.address))
				.to.emit(reBakedDAO, "ApprovedCollaborator")
				.withArgs(projectId1, packageId1, collaborator2.address);

			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator2.address);

			const currentTime = await getTimestamp();
			expect(addedCollaborator1.timeMgpApproved).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.timeMgpApproved).to.closeTo(currentTime, 10);

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			expect(package1.approvedCollaborators).to.equal(2);
		});

		it("Add 2 observers", async () => {
			await BT.expect(reBakedDAO.connect(initiator).addObserver(projectId1, [packageId1], observer1.address)).to.emit(reBakedDAO, "AddedObserver");

			await BT.expect(reBakedDAO.connect(initiator).addObserver(projectId1, [packageId1], observer2.address)).to.emit(reBakedDAO, "AddedObserver");
			const currentTime = await getTimestamp();
			let addedObserver1 = await reBakedDAO.getObserverData(projectId1, packageId1, observer1.address);
			let addedObserver2 = await reBakedDAO.getObserverData(projectId1, packageId1, observer2.address);
			expect(addedObserver1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedObserver2.timeCreated).to.closeTo(currentTime, 10);

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			expect(package1.totalObservers).to.equal(2);
		});

		// Finish package 1
		it("Finish package 1", async () => {
			await BT.expect(reBakedDAO.connect(initiator).finishPackage(projectId1, packageId1)).to.emit(reBakedDAO, "FinishedPackage");

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			const currentTime = await getTimestamp();
			expect(package1.isActive).to.be.false;
			expect(package1.timeFinished).to.closeTo(currentTime, 10);

			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(TOKEN_50.add(TOKEN_20).add(TOKEN_5));
			expect(project1.totalFinishedPackages).to.equal(1);
		});

		it("Set Bonus Score to Collaborator 1", async () => {
			await expect(reBakedDAO.connect(owner).setBonusScores(projectId1, packageId1, [collaborator1.address], [1e6])).to.emit(reBakedDAO, "SetBonusScores");

			const addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator1.address);
			expect(addedCollaborator1.bonusScore).to.equal(1e6);

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			expect(package1.collaboratorsGetBonus).to.equal(1);
		});

		it("Pay mgp to 2 collaborators", async () => {
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator2.address);

			await BT.expect(reBakedDAO.connect(initiator).payMgp(projectId1, packageId1, collaborator1.address))
				.to.changeTokenBalances(iouToken, [reBakedDAO.address, collaborator1.address], [`-${addedCollaborator1.mgp}`, addedCollaborator1.mgp])
				.to.emit(reBakedDAO, "PaidMgp")
				.withArgs(projectId1, packageId1, collaborator1.address, addedCollaborator1.mgp);

			await BT.expect(reBakedDAO.connect(initiator).payMgp(projectId1, packageId1, collaborator2.address))
				.to.changeTokenBalances(iouToken, [reBakedDAO.address, collaborator2.address], [`-${addedCollaborator2.mgp}`, addedCollaborator2.mgp])
				.to.emit(reBakedDAO, "PaidMgp")
				.withArgs(projectId1, packageId1, collaborator2.address, addedCollaborator2.mgp);

			const currentTime = await getTimestamp();
			addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator1.address);
			addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator2.address);
			expect(addedCollaborator1.timeMgpPaid).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.timeMgpPaid).to.closeTo(currentTime, 10);

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			expect(package1.budgetPaid).to.equal(TOKEN_20.add(TOKEN_5));

			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetPaid).to.equal(TOKEN_20.add(TOKEN_5));
		});

		it("Pay observer fee to 2 observers", async () => {
			let package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			const observerFee = package1.budgetObservers.div(package1.totalObservers);
			await BT.expect(reBakedDAO.connect(initiator).payObserverFee(projectId1, packageId1, observer1.address))
				.to.changeTokenBalances(iouToken, [reBakedDAO.address, observer1.address], [`-${observerFee}`, observerFee])
				.to.emit(reBakedDAO, "PaidObserverFee")
				.withArgs(projectId1, packageId1, observer1.address, observerFee);

			await BT.expect(reBakedDAO.connect(initiator).payObserverFee(projectId1, packageId1, observer2.address))
				.to.changeTokenBalances(iouToken, [reBakedDAO.address, observer2.address], [`-${observerFee}`, observerFee])
				.to.emit(reBakedDAO, "PaidObserverFee")
				.withArgs(projectId1, packageId1, observer2.address, observerFee);

			const currentTime = await getTimestamp();
			const addedObserver1 = await reBakedDAO.getObserverData(projectId1, packageId1, observer1.address);
			const addedObserver2 = await reBakedDAO.getObserverData(projectId1, packageId1, observer2.address);
			expect(addedObserver1.timePaid).to.closeTo(currentTime, 10);
			expect(addedObserver2.timePaid).to.closeTo(currentTime, 10);

			package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			expect(package1.budgetObserversPaid).to.equal(TOKEN_40);

			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetPaid).to.equal(TOKEN_50.add(TOKEN_10).add(TOKEN_5));
		});

		it("2 collaborators try to claim mgp but revert", async () => {
			await BT.expect(reBakedDAO.connect(collaborator1).claimMgp(projectId1, packageId1)).to.revertedWith("mgp already paid");
			await BT.expect(reBakedDAO.connect(collaborator2).claimMgp(projectId1, packageId1)).to.revertedWith("mgp already paid");
		});

		it("Collaborator 1 claim bonus score", async () => {
			const collaborator1Reward = await reBakedDAO.getCollaboratorRewards(projectId1, packageId1, collaborator1.address);
			await BT.expect(reBakedDAO.connect(collaborator1).claimBonus(projectId1, packageId1))
				.to.changeTokenBalances(iouToken, [reBakedDAO.address, collaborator1.address], [`-${collaborator1Reward[1]}`, collaborator1Reward[1]])
				.to.emit(reBakedDAO, "PaidBonus");

			const currentTime = await getTimestamp();
			const addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator1.address);
			expect(addedCollaborator1.timeBonusPaid).to.closeTo(currentTime, 10);

			let package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			expect(package1.bonusPaid).to.equal(TOKEN_10);
			expect(package1.collaboratorsPaidBonus).to.equal(1);

			let project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetPaid).to.equal(TOKEN_50.add(TOKEN_20).add(TOKEN_5));
		});

		it("2 Observer try to claim observer fee but revert", async () => {
			await BT.expect(reBakedDAO.connect(observer1).claimObserverFee(projectId1, packageId1)).to.revertedWith("observer already paid");
			await BT.expect(reBakedDAO.connect(observer2).claimObserverFee(projectId1, packageId1)).to.revertedWith("observer already paid");
		});

		it("Check balance after flow", async () => {
			const flowName = "flow2";
		
			await initiatorBT.takeSnapshot(flowName);
			await treasuryBT.takeSnapshot(flowName);
			await collaborator1BT.takeSnapshot(flowName);
			await collaborator2BT.takeSnapshot(flowName);
			await collaborator3BT.takeSnapshot(flowName);
			await observer1BT.takeSnapshot(flowName);
			await observer2BT.takeSnapshot(flowName);
			
			const initiatorDiff = initiatorBT.diff("begin", flowName);
			const treasuryDiff = treasuryBT.diff("begin", flowName);
			const collaborator1Diff = collaborator1BT.diff("begin", flowName);
			const collaborator2Diff = collaborator2BT.diff("begin", flowName);
			const observer1BTDiff = observer1BT.diff("begin", flowName);
			const observer2BTDiff = observer2BT.diff("begin", flowName);
			
			expect(initiatorDiff[iouToken.address].delta).to.equal(parseUnits('-1007.5', 18));
			expect(treasuryDiff[iouToken.address].delta).to.equal(parseUnits('7.5', 18));
			expect(collaborator1Diff[iouToken.address].delta).to.equal(TOKEN_20);
			expect(collaborator2Diff[iouToken.address].delta).to.equal(TOKEN_10.add(TOKEN_5));
			expect(observer1BTDiff[iouToken.address].delta).to.equal(TOKEN_20);
			expect(observer2BTDiff[iouToken.address].delta).to.equal(TOKEN_20);
		});
	});

	describe("No collaborator, no observer (Project 1, Package 2)", () => {
		let packageId2: string;

		it("Add package 2", async () => {
			tx = await BT.updateFee(reBakedDAO.connect(initiator).createPackage(projectId1, TOKEN_50, TOKEN_20, TOKEN_30, 5));
			receipt = await tx.wait();
			packageId2 = receipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(
				TOKEN_50.add(TOKEN_100)
					.add(TOKEN_20)
					.add(TOKEN_5)
			);
			expect(project1.totalPackages).to.equal(2);

			const package2 = await reBakedDAO.getPackageData(projectId1, packageId2);
			const currentTime = await getTimestamp();
			expect(package2.budget).to.equal(TOKEN_50);
			expect(package2.bonus).to.equal(TOKEN_20);
			expect(package2.budgetObservers).to.equal(TOKEN_30);
			expect(package2.maxCollaborators).to.equal(5);
			expect(package2.isActive).to.be.true;
			expect(package2.timeCreated).to.closeTo(currentTime, 10);
			expect(package2.maxCollaborators).to.equal(5);
		});

		it("Finish package 2", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).finishPackage(projectId1, packageId2));
			const package2 = await reBakedDAO.getPackageData(projectId1, packageId2);
			const currentTime = await getTimestamp();
			expect(package2.isActive).to.be.false;
			expect(package2.timeFinished).to.closeTo(currentTime, 10);

			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(TOKEN_50.add(TOKEN_20).add(TOKEN_5));
			expect(project1.totalFinishedPackages).to.equal(2);
		});

		it("Check balance after flow", async () => {
			const flowName = "flow3";
			await initiatorBT.takeSnapshot(flowName);
			await treasuryBT.takeSnapshot(flowName);
			await collaborator1BT.takeSnapshot(flowName);
			await collaborator2BT.takeSnapshot(flowName);
			await collaborator3BT.takeSnapshot(flowName);
			await observer1BT.takeSnapshot(flowName);
			await observer2BT.takeSnapshot(flowName);

			const initiatorDiff = await initiatorBT.diff("flow2", flowName);
			const treasuryDiff = await treasuryBT.diff("flow2", flowName);
			const collaborator1Diff = collaborator1BT.diff("flow2", flowName);
			const collaborator2Diff = collaborator2BT.diff("flow2", flowName);
			const observer1BTDiff = observer1BT.diff("flow2", flowName);
			const observer2BTDiff = observer2BT.diff("flow2", flowName);

			expect(initiatorDiff[iouToken.address].delta).to.equal(`-${TOKEN_5}`);
			expect(treasuryDiff[iouToken.address].delta).to.equal(TOKEN_5);
			expect(collaborator1Diff[iouToken.address].delta).to.equal(0);
			expect(collaborator2Diff[iouToken.address].delta).to.equal(0);
			expect(observer1BTDiff[iouToken.address].delta).to.equal(0);
			expect(observer2BTDiff[iouToken.address].delta).to.equal(0);
		});
	});

	describe("Normal removing collaborator (Project 1, Package 3)", () => {
		let packageId3: string;

		it("Add package 3", async () => {
			tx = await BT.updateFee(reBakedDAO.connect(initiator).createPackage(projectId1, TOKEN_50, TOKEN_20, TOKEN_30, 5));
			receipt = await tx.wait();
			packageId3 = receipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(parseUnits("175", 18));
			expect(project1.totalPackages).to.equal(3);

			const package3 = await reBakedDAO.getPackageData(projectId1, packageId3);
			const currentTime = await getTimestamp();
			expect(package3.budget).to.equal(TOKEN_50);
			expect(package3.bonus).to.equal(TOKEN_20);
			expect(package3.budgetObservers).to.equal(TOKEN_30);
			expect(package3.maxCollaborators).to.equal(5);
			expect(package3.isActive).to.be.true;
			expect(package3.timeCreated).to.closeTo(currentTime, 10);
		});

		it("Add 3 collaborators", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId3, collaborator1.address, TOKEN_10));
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId3, collaborator2.address, TOKEN_5));
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId3, collaborator3.address, TOKEN_10.add(TOKEN_5)));
			const currentTime = await getTimestamp();
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator2.address);
			let addedCollaborator3 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator3.address);

			expect(addedCollaborator1.mgp).to.equal(TOKEN_10);
			expect(addedCollaborator1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.mgp).to.equal(TOKEN_5);
			expect(addedCollaborator2.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator3.mgp).to.equal(TOKEN_10.add(TOKEN_5));
			expect(addedCollaborator3.timeCreated).to.closeTo(currentTime, 10);

			const package3 = await reBakedDAO.getPackageData(projectId1, packageId3);
			expect(package3.budgetAllocated).to.equal(TOKEN_20.add(TOKEN_10));
			expect(package3.totalCollaborators).to.equal(3);
		});

		it("Remove Collaborator 1 with no MGP and Collaborator 1 do not defend removal", async () => {
			await BT.expect(reBakedDAO.connect(initiator).removeCollaborator(projectId1, packageId3, collaborator1.address, false))
				.to.emit(reBakedDAO, "RequestedRemoval")
				.withArgs(projectId1, packageId3, collaborator1.address);

			const currentTime = await getTimestamp();
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator1.address);
			expect(addedCollaborator1.disputeExpiresAt).to.closeTo(currentTime + TWO_DAYS, 10);

			const package3 = await reBakedDAO.getPackageData(projectId1, packageId3);
			expect(package3.disputesCount).to.equal(1);
		});

		it("Initiator Settle expired dispute for collaborator 1", async () => {
			await skipTime(TWO_DAYS + 1);
			await BT.expect(reBakedDAO.connect(initiator).settleExpiredDispute(projectId1, packageId3, collaborator1.address))
				.to.emit(reBakedDAO, "RemovedCollaborator")
				.withArgs(projectId1, packageId3, collaborator1.address);

			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator1.address);
			expect(addedCollaborator1.disputeExpiresAt).to.equal(0);
			expect(addedCollaborator1.resolveExpiresAt).to.equal(0);

			const package3 = await reBakedDAO.getPackageData(projectId1, packageId3);
			expect(package3.budgetAllocated).to.equal(TOKEN_20);
			expect(package3.disputesCount).to.equal(0);
		});

		it("Remove Collaborator 2 with MGP", async () => {
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator2.address);
			await BT.expect(reBakedDAO.connect(initiator).removeCollaborator(projectId1, packageId3, collaborator2.address, true))
				.to.changeTokenBalances(iouToken, [reBakedDAO.address, collaborator2.address], [`-${addedCollaborator2.mgp}`, addedCollaborator2.mgp])
				.to.emit(reBakedDAO, "RemovedCollaborator")
				.withArgs(projectId1, packageId3, collaborator2.address)
				.to.emit(reBakedDAO, "PaidMgp")
				.withArgs(projectId1, packageId3, collaborator2.address, addedCollaborator2.mgp);

			addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator2.address);
			const currentTime = await getTimestamp();
			expect(addedCollaborator2.isRemoved).to.be.true;
			expect(addedCollaborator2.timeMgpPaid).to.closeTo(currentTime, 10);

			const package3 = await reBakedDAO.getPackageData(projectId1, packageId3);
			expect(package3.budgetPaid).to.equal(TOKEN_5);
			expect(package3.budgetAllocated).to.equal(TOKEN_10.add(TOKEN_5));

			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetPaid).to.equal(TOKEN_50.add(TOKEN_30));
		});

		it("Approve Collaborator 3", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).approveCollaborator(projectId1, packageId3, collaborator3.address));

			let addedCollaborator3 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator3.address);

			const currentTime = await getTimestamp();
			expect(addedCollaborator3.timeMgpApproved).to.closeTo(currentTime, 10);

			const package3 = await reBakedDAO.getPackageData(projectId1, packageId3);
			expect(package3.approvedCollaborators).to.equal(1);
		});

		it("Finish package 3", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).finishPackage(projectId1, packageId3));
			const package3 = await reBakedDAO.getPackageData(projectId1, packageId3);
			const currentTime = await getTimestamp();
			expect(package3.isActive).to.be.false;
			expect(package3.timeFinished).to.closeTo(currentTime, 10);

			const TOKEN_110 = parseUnits("110", 18);
			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(TOKEN_110);
			expect(project1.totalFinishedPackages).to.equal(3);
		});

		it("Collaborator 2 try to claim MGP but revert", async () => {
			await BT.expect(reBakedDAO.connect(collaborator2).claimMgp(projectId1, packageId3)).to.revertedWith("no such collaborator");
		});

		it("Collaborator 3 claim MGP", async () => {
			let addedCollaborator3 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator3.address);
			await BT.expect(reBakedDAO.connect(collaborator3).claimMgp(projectId1, packageId3))
				.to.changeTokenBalances(iouToken, [reBakedDAO.address, collaborator3.address], [`-${addedCollaborator3.mgp}`, addedCollaborator3.mgp])
				.to.emit(reBakedDAO, "PaidMgp")
				.withArgs(projectId1, packageId3, collaborator3.address, addedCollaborator3.mgp);

			const currentTime = await getTimestamp();
			addedCollaborator3 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator3.address);
			expect(addedCollaborator3.timeMgpPaid).to.closeTo(currentTime, 10);

			const package3 = await reBakedDAO.getPackageData(projectId1, packageId3);
			expect(package3.budgetPaid).to.equal(TOKEN_20);

			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetPaid).to.equal(TOKEN_100.sub(TOKEN_5));
		});

		it("Check balance after flow", async () => {
			const flowName = "flow4";
			await initiatorBT.takeSnapshot(flowName);
			await treasuryBT.takeSnapshot(flowName);
			await collaborator1BT.takeSnapshot(flowName);
			await collaborator2BT.takeSnapshot(flowName);
			await collaborator3BT.takeSnapshot(flowName);
			await observer1BT.takeSnapshot(flowName);
			await observer2BT.takeSnapshot(flowName);

			const initiatorDiff = initiatorBT.diff("flow3", flowName);
			const treasuryDiff = treasuryBT.diff("flow3", flowName);
			const collaborator1Diff = collaborator1BT.diff("flow3", flowName);
			const collaborator2Diff = collaborator2BT.diff("flow3", flowName);
			const collaborator3Diff = collaborator3BT.diff("flow3", flowName);

			expect(initiatorDiff[iouToken.address].delta).to.equal(`-${TOKEN_5}`);
			expect(treasuryDiff[iouToken.address].delta).to.equal(TOKEN_5);
			expect(collaborator1Diff[iouToken.address].delta).to.equal(0);
			expect(collaborator2Diff[iouToken.address].delta).to.equal(TOKEN_5);
			expect(collaborator3Diff[iouToken.address].delta).to.equal(TOKEN_10.add(TOKEN_5));
		});
	});

	describe("Defend removal (Project 1, Package 4)", () => {
		let packageId4: string;
		it("Add package 4", async () => {
			tx = await BT.updateFee(reBakedDAO.connect(initiator).createPackage(projectId1, TOKEN_100, TOKEN_20, TOKEN_30, 5));
			receipt = await tx.wait();
			packageId4 = receipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(parseUnits("260", 18));
			expect(project1.totalPackages).to.equal(4);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			const currentTime = await getTimestamp();
			expect(package4.budget).to.equal(TOKEN_100);
			expect(package4.bonus).to.equal(TOKEN_20);
			expect(package4.budgetObservers).to.equal(TOKEN_30);
			expect(package4.maxCollaborators).to.equal(5);
			expect(package4.isActive).to.be.true;
			expect(package4.timeCreated).to.closeTo(currentTime, 10);
		});

		it("Add 3 collaborators", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId4, collaborator1.address, TOKEN_20));
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId4, collaborator2.address, TOKEN_30));
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId4, collaborator3.address, TOKEN_20));
			const currentTime = await getTimestamp();
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator2.address);
			let addedCollaborator3 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator3.address);

			expect(addedCollaborator1.mgp).to.equal(TOKEN_20);
			expect(addedCollaborator1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.mgp).to.equal(TOKEN_30);
			expect(addedCollaborator2.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator3.mgp).to.equal(TOKEN_20);
			expect(addedCollaborator3.timeCreated).to.closeTo(currentTime, 10);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			expect(package4.budgetAllocated).to.equal(TOKEN_20.add(TOKEN_50));
			expect(package4.totalCollaborators).to.equal(3);
		});

		it("Remove Collaborator 1 with no MGP", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).removeCollaborator(projectId1, packageId4, collaborator1.address, false));

			const currentTime = await getTimestamp();
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator1.address);
			expect(addedCollaborator1.disputeExpiresAt).to.closeTo(currentTime + TWO_DAYS, 10);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			expect(package4.disputesCount).to.equal(1);
		});

		it("Collaborator 1 defend removal", async () => {
			await BT.expect(reBakedDAO.connect(collaborator1).defendRemoval(projectId1, packageId4))
				.to.emit(reBakedDAO, "DefendedRemoval")
				.withArgs(projectId1, packageId4, collaborator1.address);

			const currentTime = await getTimestamp();
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator1.address);
			expect(addedCollaborator1.resolveExpiresAt).to.closeTo(currentTime + THREE_DAYS, 10);
		});

		it("Resolve dispute Collaborator 1 with no MGP", async () => {
			await expect(reBakedDAO.connect(owner).resolveDispute(projectId1, packageId4, collaborator1.address, false))
				.to.emit(reBakedDAO, "RemovedCollaborator")
				.withArgs(projectId1, packageId4, collaborator1.address);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			expect(package4.disputesCount).to.equal(0);
			expect(package4.totalCollaborators).to.equal(2);
			expect(package4.budgetAllocated).to.equal(TOKEN_50);

			const addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator1.address);
			expect(addedCollaborator1.isRemoved).to.be.true;
			expect(addedCollaborator1.disputeExpiresAt).to.equal(0);
			expect(addedCollaborator1.resolveExpiresAt).to.equal(0);
		});

		it("Remove Collaborator 2 with no MGP", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).removeCollaborator(projectId1, packageId4, collaborator2.address, false));

			const currentTime = await getTimestamp();
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator2.address);
			expect(addedCollaborator2.disputeExpiresAt).to.closeTo(currentTime + TWO_DAYS, 10);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			expect(package4.disputesCount).to.equal(1);
		});

		it("Collaborator 2 defend removal", async () => {
			await BT.updateFee(reBakedDAO.connect(collaborator2).defendRemoval(projectId1, packageId4));

			const currentTime = await getTimestamp();
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator2.address);
			expect(addedCollaborator2.resolveExpiresAt).to.closeTo(currentTime + THREE_DAYS, 10);
		});

		it("Resolve dispute Collaborator 2 with MGP", async () => {
			await reBakedDAO.connect(owner).resolveDispute(projectId1, packageId4, collaborator2.address, true);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			expect(package4.budgetPaid).to.equal(TOKEN_30);
			expect(package4.budgetAllocated).to.equal(TOKEN_20);
			expect(package4.totalCollaborators).to.equal(1);
			expect(package4.disputesCount).to.equal(0);

			const addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator2.address);
			expect(addedCollaborator2.isRemoved).to.be.true;
			expect(addedCollaborator2.disputeExpiresAt).to.equal(0);
			expect(addedCollaborator2.resolveExpiresAt).to.equal(0);

			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetPaid).to.equal(parseUnits("125", 18));
		});

		it("Approve Collaborator 3", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).approveCollaborator(projectId1, packageId4, collaborator3.address));

			let addedCollaborator3 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator3.address);

			const currentTime = await getTimestamp();
			expect(addedCollaborator3.timeMgpApproved).to.closeTo(currentTime, 10);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			expect(package4.approvedCollaborators).to.equal(1);
		});

		it("Finish package 4", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).finishPackage(projectId1, packageId4));
			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			const currentTime = await getTimestamp();
			expect(package4.isActive).to.be.false;
			expect(package4.timeFinished).to.closeTo(currentTime, 10);

			const TOKEN_150 = parseUnits("150", 18);
			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(TOKEN_150);
			expect(project1.totalFinishedPackages).to.equal(4);
		});

		it("Pay MGP to Collaborator 3", async () => {
			let addedCollaborator3 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator3.address);
			await BT.expect(reBakedDAO.connect(initiator).payMgp(projectId1, packageId4, collaborator3.address))
				.to.changeTokenBalances(iouToken, [reBakedDAO.address, collaborator3.address], [`-${addedCollaborator3.mgp}`, addedCollaborator3.mgp])
				.to.emit(reBakedDAO, "PaidMgp")
				.withArgs(projectId1, packageId4, collaborator3.address, addedCollaborator3.mgp);

			const currentTime = await getTimestamp();
			addedCollaborator3 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator3.address);
			expect(addedCollaborator3.timeMgpPaid).to.closeTo(currentTime, 10);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			expect(package4.budgetPaid).to.equal(TOKEN_50);

			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetPaid).to.equal(parseUnits("145", 18));
		});

		it("Collaborator 3 try to claim MGP but revert", async () => {
			await BT.expect(reBakedDAO.connect(collaborator3).claimMgp(projectId1, packageId4)).to.revertedWith("mgp already paid");
		});

		it("Check balance after flow", async () => {
			const flowName = "flow5";
			await initiatorBT.takeSnapshot(flowName);
			await treasuryBT.takeSnapshot(flowName);
			await collaborator1BT.takeSnapshot(flowName);
			await collaborator2BT.takeSnapshot(flowName);
			await collaborator3BT.takeSnapshot(flowName);
			await observer1BT.takeSnapshot(flowName);
			await observer2BT.takeSnapshot(flowName);

			const initiatorDiff = initiatorBT.diff("flow4", flowName);
			const treasuryDiff = treasuryBT.diff("flow4", flowName);
			const collaborator1Diff = collaborator1BT.diff("flow4", flowName);
			const collaborator2Diff = collaborator2BT.diff("flow4", flowName);
			const collaborator3Diff = collaborator3BT.diff("flow4", flowName);

			expect(initiatorDiff[iouToken.address].delta).to.equal(parseUnits('-7.5', 18));
			expect(treasuryDiff[iouToken.address].delta).to.equal(parseUnits('7.5', 18));
			expect(collaborator1Diff[iouToken.address].delta).to.equal(0);
			expect(collaborator2Diff[iouToken.address].delta).to.equal(TOKEN_30);
			expect(collaborator3Diff[iouToken.address].delta).to.equal(TOKEN_20);
		});
	});

	describe("Self removing (Project 1, Package 5)", () => {
		let packageId5: string;
		it("Add package 5", async () => {
			tx = await BT.updateFee(reBakedDAO.connect(initiator).createPackage(projectId1, TOKEN_100, TOKEN_30, TOKEN_50, 4));
			receipt = await tx.wait();
			packageId5 = receipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(parseUnits("330", 18));
			expect(project1.totalPackages).to.equal(5);

			const package5 = await reBakedDAO.getPackageData(projectId1, packageId5);
			const currentTime = await getTimestamp();
			expect(package5.budget).to.equal(TOKEN_100);
			expect(package5.bonus).to.equal(TOKEN_30);
			expect(package5.budgetObservers).to.equal(TOKEN_50);
			expect(package5.maxCollaborators).to.equal(4);
			expect(package5.isActive).to.be.true;
			expect(package5.timeCreated).to.closeTo(currentTime, 10);
		});

		it("Add 2 collaborators", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId5, collaborator1.address, TOKEN_20));
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId5, collaborator2.address, TOKEN_10));
			const currentTime = await getTimestamp();
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId5, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId5, collaborator2.address);

			expect(addedCollaborator1.mgp).to.equal(TOKEN_20);
			expect(addedCollaborator1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.mgp).to.equal(TOKEN_10);
			expect(addedCollaborator2.timeCreated).to.closeTo(currentTime, 10);

			const package5 = await reBakedDAO.getPackageData(projectId1, packageId5);
			expect(package5.budgetAllocated).to.equal(TOKEN_30);
			expect(package5.totalCollaborators).to.equal(2);
		});

		it("Collaborator 1 self removing", async () => {
			await BT.expect(reBakedDAO.connect(collaborator1).selfRemove(projectId1, packageId5))
				.to.emit(reBakedDAO, "RemovedCollaborator")
				.withArgs(projectId1, packageId5, collaborator1.address);

			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId5, collaborator1.address);
			expect(addedCollaborator1.isRemoved).to.be.true;

			const package5 = await reBakedDAO.getPackageData(projectId1, packageId5);
			expect(package5.budgetAllocated).to.equal(TOKEN_10);
			expect(package5.totalCollaborators).to.equal(1);
		});

		it("Approve Collaborator 2", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).approveCollaborator(projectId1, packageId5, collaborator2.address));

			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId5, collaborator2.address);

			const currentTime = await getTimestamp();
			expect(addedCollaborator2.timeMgpApproved).to.closeTo(currentTime, 10);

			const package5 = await reBakedDAO.getPackageData(projectId1, packageId5);
			expect(package5.approvedCollaborators).to.equal(1);
		});

		it("Finish package 5", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).finishPackage(projectId1, packageId5));
			const package5 = await reBakedDAO.getPackageData(projectId1, packageId5);
			const currentTime = await getTimestamp();
			expect(package5.isActive).to.be.false;
			expect(package5.timeFinished).to.closeTo(currentTime, 10);

			const TOKEN_190 = parseUnits("190", 18);
			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(TOKEN_190);
			expect(project1.totalFinishedPackages).to.equal(5);
		});

		it("Pay MGP to Collaborator 2", async () => {
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId5, collaborator2.address);
			await BT.expect(reBakedDAO.connect(initiator).payMgp(projectId1, packageId5, collaborator2.address)).to.changeTokenBalances(
				iouToken,
				[reBakedDAO.address, collaborator2.address],
				[`-${addedCollaborator2.mgp}`, addedCollaborator2.mgp]
			);

			const currentTime = await getTimestamp();
			addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId5, collaborator2.address);
			expect(addedCollaborator2.timeMgpPaid).to.closeTo(currentTime, 10);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId5);
			expect(package4.budgetPaid).to.equal(TOKEN_10);

			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetPaid).to.equal(parseUnits("155", 18));
		});

		it("Set Bonus Score to Collaborator 2", async () => {
			await reBakedDAO.connect(owner).setBonusScores(projectId1, packageId5, [collaborator2.address], [1e6]);

			const addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId5, collaborator2.address);
			expect(addedCollaborator2.bonusScore).to.equal(1e6);

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId5);
			expect(package1.collaboratorsGetBonus).to.equal(1);
		});

		it("Collaborator 2 claim Bonus Score", async () => {
			const collaborator2Reward = await reBakedDAO.getCollaboratorRewards(projectId1, packageId5, collaborator2.address);
			await BT.expect(reBakedDAO.connect(collaborator2).claimBonus(projectId1, packageId5)).to.changeTokenBalances(iouToken, [reBakedDAO.address, collaborator2.address], [`-${collaborator2Reward[1]}`, collaborator2Reward[1]]);

			const currentTime = await getTimestamp();
			const addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId5, collaborator2.address);
			expect(addedCollaborator2.timeBonusPaid).to.closeTo(currentTime, 10);

			let package5 = await reBakedDAO.getPackageData(projectId1, packageId5);
			expect(package5.bonusPaid).to.equal(TOKEN_30);
			expect(package5.collaboratorsPaidBonus).to.equal(1);

			const TOKEN_185 = parseUnits("185", 18);
			let project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetPaid).to.equal(TOKEN_185);
		});

		it("Check balance after flow", async () => {
			const flowName = "flow6";
			await initiatorBT.takeSnapshot(flowName);
			await treasuryBT.takeSnapshot(flowName);
			await collaborator1BT.takeSnapshot(flowName);
			await collaborator2BT.takeSnapshot(flowName);
			await collaborator3BT.takeSnapshot(flowName);
			await observer1BT.takeSnapshot(flowName);
			await observer2BT.takeSnapshot(flowName);

			const initiatorDiff = initiatorBT.diff("flow5", flowName);
			const treasuryDiff = treasuryBT.diff("flow5", flowName);
			const collaborator1Diff = collaborator1BT.diff("flow5", flowName);
			const collaborator2Diff = collaborator2BT.diff("flow5", flowName);

			expect(initiatorDiff[iouToken.address].delta).to.equal(parseUnits('-9', 18));
			expect(treasuryDiff[iouToken.address].delta).to.equal(parseUnits('9', 18));
			expect(collaborator1Diff[iouToken.address].delta).to.equal(0);
			expect(collaborator2Diff[iouToken.address].delta).to.equal(TOKEN_40);
		});
	});

	describe("Finish project (Project 1)", () => {
		it("Finish project 1", async () => {
			await BT.expect(reBakedDAO.connect(initiator).finishProject(projectId1))
				.to.changeTokenBalances(iouToken, [reBakedDAO.address, initiator.address, treasury.address], [parseUnits("-810", 18), parseUnits("40.5", 18), parseUnits("769.5", 18)])
				.to.emit(reBakedDAO, "FinishedProject")
				.withArgs(projectId1);
		});

		it("Check balance after flow", async () => {
			const flowName = "flow7";
			await collaborator1BT.takeSnapshot(flowName);
			await collaborator2BT.takeSnapshot(flowName);
			await collaborator3BT.takeSnapshot(flowName);
			await observer1BT.takeSnapshot(flowName);
			await observer2BT.takeSnapshot(flowName);
			await initiatorBT.takeSnapshot(flowName);
			await treasuryBT.takeSnapshot(flowName);

			const initiatorDiff = initiatorBT.diff("flow6", flowName);
			const treasuryDiff = treasuryBT.diff("flow6", flowName);

			expect(initiatorDiff[iouToken.address].delta).to.equal(parseUnits("40.5", 18))
			expect(treasuryDiff[iouToken.address].delta).to.equal(parseUnits("769.5", 18))
		});
	});
});
