import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ReBakedDAO, ReBakedDAO__factory, TokenFactory, TokenFactory__factory, IOUToken, IOUToken__factory, NFTReward, NFTReward__factory } from "../../typechain-types";
import { ContractReceipt, ContractTransaction } from "ethers";
import { ZERO_ADDRESS, MAX_UINT256, getTimestamp, skipTime, BalanceTracker as BT } from "../utils";

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
const tokenName = "Pioneer",
	tokenSymbol = "PIO";

let projectId1: string, projectId2: string, projectId3: string;
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

describe("Integration test", () => {
	before(async () => {
		[owner, treasury, initiator, collaborator1, collaborator2, collaborator3, observer1, observer2, ...accounts] = await ethers.getSigners();

		const TokenFactory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
		const IOUToken = (await ethers.getContractFactory("IOUToken")) as IOUToken__factory;
		const ReBakedDAO = (await ethers.getContractFactory("ReBakedDAO")) as ReBakedDAO__factory;
		const NFTReward_factory = (await ethers.getContractFactory("NFTReward")) as NFTReward__factory;

		const nftReward: NFTReward = await NFTReward_factory.deploy();
		await nftReward.deployed();

		tokenFactory = (await upgrades.deployProxy(TokenFactory, [nftReward.address])) as TokenFactory;
		iouToken = await IOUToken.deploy(initiator.address, "10000000000000000000000", tokenName, tokenSymbol);
		reBakedDAO = (await upgrades.deployProxy(ReBakedDAO, [treasury.address])) as ReBakedDAO;
		await reBakedDAO.deployed();

		await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);

		// Early transactions

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
		it("Verify RebakedDAO contract parameters", async () => {
			expect(await reBakedDAO.treasury()).to.equal(treasury.address);
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
			expect(project1.budget).to.equal(TOKEN_1000);
			expect(project1.timeCreated).to.closeTo(currentTime, 10);
		});

		it("Add package 1", async () => {
			tx = await BT.updateFee(reBakedDAO.connect(initiator).createPackage(projectId1, TOKEN_100, TOKEN_10, TOKEN_40, 3, []));
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
			expect(package1.collaboratorsLimit).to.equal(3);
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
			await BT.expect(reBakedDAO.connect(initiator).addObservers(projectId1, packageId1, [observer1.address, observer2.address])).to.emit(reBakedDAO, "AddedObservers");

			// await BT.expect(reBakedDAO.connect(initiator).addObservers(projectId1, packageId1, [observer2.address])).to.emit(reBakedDAO, "AddedObserver");
			const currentTime = await getTimestamp();
			let addedObserver1 = await reBakedDAO.getObserverData(projectId1, packageId1, observer1.address);
			let addedObserver2 = await reBakedDAO.getObserverData(projectId1, packageId1, observer2.address);
			expect(addedObserver1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedObserver2.timeCreated).to.closeTo(currentTime, 10);

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			expect(package1.totalObservers).to.equal(2);
		});

		it("Finish package 1", async () => {
			await BT.expect(reBakedDAO.connect(initiator).finishPackage(projectId1, packageId1, [collaborator1.address, collaborator2.address], [observer1.address, observer2.address], [9 * 1e5, 1e5])).to.emit(reBakedDAO, "FinishedPackage");

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			const currentTime = await getTimestamp();
			expect(package1.isActive).to.be.false;
			expect(package1.timeFinished).to.closeTo(currentTime, 10);

			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(TOKEN_50.add(TOKEN_20).add(TOKEN_5));
			expect(project1.totalFinishedPackages).to.equal(1);
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

			expect(initiatorDiff[iouToken.address].delta).to.equal(parseUnits("-1007.5", 18));
			expect(treasuryDiff[iouToken.address].delta).to.equal(parseUnits("7.5", 18));
			expect(collaborator1Diff[iouToken.address].delta).to.equal(TOKEN_20.sub(TOKEN_5.div(5)));
			expect(collaborator2Diff[iouToken.address].delta).to.equal(TOKEN_10.add(TOKEN_5.div(5).mul(6)));
			expect(observer1BTDiff[iouToken.address].delta).to.equal(TOKEN_20);
			expect(observer2BTDiff[iouToken.address].delta).to.equal(TOKEN_20);
		});
	});

	describe("No collaborator, no observer (Project 1, Package 2)", () => {
		let packageId2: string;

		it("Add package 2", async () => {
			tx = await BT.updateFee(reBakedDAO.connect(initiator).createPackage(projectId1, TOKEN_50, TOKEN_20, TOKEN_30, 5, []));
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
			expect(package2.collaboratorsLimit).to.equal(5);
			expect(package2.isActive).to.be.true;
			expect(package2.timeCreated).to.closeTo(currentTime, 10);
			expect(package2.collaboratorsLimit).to.equal(5);
		});

		it("Finish package 2", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).finishPackage(projectId1, packageId2, [], [], []));
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
			tx = await BT.updateFee(reBakedDAO.connect(initiator).createPackage(projectId1, TOKEN_50, TOKEN_20, TOKEN_30, 5, []));
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
			expect(package3.collaboratorsLimit).to.equal(5);
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

		it("Remove Collaborator 1 with no MGP", async () => {
			await BT.expect(reBakedDAO.connect(initiator).removeCollaborator(projectId1, packageId3, collaborator1.address, false))
				.to.emit(reBakedDAO, "RemovedCollaborator")
				.withArgs(projectId1, packageId3, collaborator1.address);
		});

		it("Remove Collaborator 2 with MGP", async () => {
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator2.address);
			await BT.expect(reBakedDAO.connect(initiator).removeCollaborator(projectId1, packageId3, collaborator2.address, true))
				.to.changeTokenBalances(iouToken, [reBakedDAO.address, collaborator2.address], [`-${addedCollaborator2.mgp}`, addedCollaborator2.mgp])
				.to.emit(reBakedDAO, "RemovedCollaborator")
				.withArgs(projectId1, packageId3, collaborator2.address)
				.to.emit(reBakedDAO, "PaidCollaboratorRewards")

			addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId3, collaborator2.address);
			const currentTime = await getTimestamp();
			expect(addedCollaborator2.isRemoved).to.be.true;
			expect(addedCollaborator2.timeMgpPaid).to.closeTo(currentTime, 10);

			const package3 = await reBakedDAO.getPackageData(projectId1, packageId3);
			expect(package3.budgetPaid).to.equal(TOKEN_5);
			expect(package3.budgetAllocated).to.equal(TOKEN_20);

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
			await BT.updateFee(reBakedDAO.connect(initiator).finishPackage(projectId1, packageId3, [collaborator3.address], [], [1e6]));
			const package3 = await reBakedDAO.getPackageData(projectId1, packageId3);
			const currentTime = await getTimestamp();
			expect(package3.isActive).to.be.false;
			expect(package3.timeFinished).to.closeTo(currentTime, 10);

			const TOKEN_110 = parseUnits("110", 18);
			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(TOKEN_110.add(TOKEN_5));
			expect(project1.totalFinishedPackages).to.equal(3);
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
			expect(collaborator3Diff[iouToken.address].delta).to.equal(TOKEN_30.add(TOKEN_5));
		});
	});

	describe("Self removing (Project 1, Package 4)", () => {
		let packageId4: string;
		it("Add package 4", async () => {
			tx = await BT.updateFee(reBakedDAO.connect(initiator).createPackage(projectId1, TOKEN_100, TOKEN_30, TOKEN_50, 4, []));
			receipt = await tx.wait();
			packageId4 = receipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(parseUnits("295", 18));
			expect(project1.totalPackages).to.equal(4);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			const currentTime = await getTimestamp();
			expect(package4.budget).to.equal(TOKEN_100);
			expect(package4.bonus).to.equal(TOKEN_30);
			expect(package4.budgetObservers).to.equal(TOKEN_50);
			expect(package4.collaboratorsLimit).to.equal(4);
			expect(package4.isActive).to.be.true;
			expect(package4.timeCreated).to.closeTo(currentTime, 10);
		});

		it("Add 2 collaborators", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId4, collaborator1.address, TOKEN_20));
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId4, collaborator2.address, TOKEN_10));
			const currentTime = await getTimestamp();
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator2.address);

			expect(addedCollaborator1.mgp).to.equal(TOKEN_20);
			expect(addedCollaborator1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.mgp).to.equal(TOKEN_10);
			expect(addedCollaborator2.timeCreated).to.closeTo(currentTime, 10);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			expect(package4.budgetAllocated).to.equal(TOKEN_30);
			expect(package4.totalCollaborators).to.equal(2);
		});

		it("Collaborator 1 self removing", async () => {
			await BT.expect(reBakedDAO.connect(collaborator1).selfRemove(projectId1, packageId4))
				.to.emit(reBakedDAO, "RemovedCollaborator")
				.withArgs(projectId1, packageId4, collaborator1.address);

			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator1.address);
			expect(addedCollaborator1.isRemoved).to.be.true;

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			expect(package4.budgetAllocated).to.equal(TOKEN_10);
			expect(package4.totalCollaborators).to.equal(1);
		});

		it("Approve Collaborator 2", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).approveCollaborator(projectId1, packageId4, collaborator2.address));

			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId4, collaborator2.address);

			const currentTime = await getTimestamp();
			expect(addedCollaborator2.timeMgpApproved).to.closeTo(currentTime, 10);

			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			expect(package4.approvedCollaborators).to.equal(1);
		});

		it("Finish package 4", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).finishPackage(projectId1, packageId4, [collaborator2.address], [], [1e6]));
			const package4 = await reBakedDAO.getPackageData(projectId1, packageId4);
			const currentTime = await getTimestamp();
			expect(package4.isActive).to.be.false;
			expect(package4.timeFinished).to.closeTo(currentTime, 10);

			const TOKEN_150 = parseUnits("150", 18);
			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(TOKEN_150.add(TOKEN_5));
			expect(project1.totalFinishedPackages).to.equal(4);
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

			expect(initiatorDiff[iouToken.address].delta).to.equal(parseUnits("-9", 18));
			expect(treasuryDiff[iouToken.address].delta).to.equal(parseUnits("9", 18));
			expect(collaborator1Diff[iouToken.address].delta).to.equal(0);
			expect(collaborator2Diff[iouToken.address].delta).to.equal(TOKEN_40);
		});
	});

	describe("Finish project (Project 1)", () => {
		it("Finish project 1", async () => {
			await BT.expect(reBakedDAO.connect(initiator).finishProject(projectId1))
				.to.changeTokenBalances(iouToken, [reBakedDAO.address, initiator.address], [parseUnits("-845", 18), parseUnits("845", 18)])
				.to.emit(reBakedDAO, "FinishedProject")
				.withArgs(projectId1, "845000000000000000000");
		});

		it("Check balance after flow", async () => {
			const flowName = "flow6";
			await collaborator1BT.takeSnapshot(flowName);
			await collaborator2BT.takeSnapshot(flowName);
			await collaborator3BT.takeSnapshot(flowName);
			await observer1BT.takeSnapshot(flowName);
			await observer2BT.takeSnapshot(flowName);
			await initiatorBT.takeSnapshot(flowName);
			await treasuryBT.takeSnapshot(flowName);

			const initiatorDiff = initiatorBT.diff("flow5", flowName);

			expect(initiatorDiff[iouToken.address].delta).to.equal(parseUnits("845", 18));
		});
	});

	describe("Start project with no token (Project 2, Package 1)", () => {
		let packageId1: string;
		it("Create project 2 with no token", async () => {
			let tx: ContractTransaction = await BT.updateFee(reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000));
			let receipt: ContractReceipt = await tx.wait();
			projectId2 = receipt.events!.find(ev => ev.event === "CreatedProject")!.args![0];

			let project2 = await reBakedDAO.getProjectData(projectId2);
			let currentTime = await getTimestamp();
			expect(project2.initiator).to.equal(initiator.address);
			expect(project2.token).to.equal(iouToken.address);
			expect(project2.budget).to.equal(TOKEN_1000);
			expect(project2.timeCreated).to.closeTo(currentTime, 10);
		});

		it("Add package 1", async () => {
			tx = await BT.updateFee(reBakedDAO.connect(initiator).createPackage(projectId2, TOKEN_100, TOKEN_50, TOKEN_50, 4, []));
			receipt = await tx.wait();
			packageId1 = receipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
			const project2 = await reBakedDAO.getProjectData(projectId2);
			expect(project2.budgetAllocated).to.equal(TOKEN_100.mul(2));
			expect(project2.totalPackages).to.equal(1);

			const package1 = await reBakedDAO.getPackageData(projectId2, packageId1);
			const currentTime = await getTimestamp();
			expect(package1.budget).to.equal(TOKEN_100);
			expect(package1.bonus).to.equal(TOKEN_50);
			expect(package1.budgetObservers).to.equal(TOKEN_50);
			expect(package1.collaboratorsLimit).to.equal(4);
			expect(package1.isActive).to.be.true;
			expect(package1.timeCreated).to.closeTo(currentTime, 10);
		});

		it("Add 2 collaborators", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId2, packageId1, collaborator1.address, TOKEN_30));
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId2, packageId1, collaborator2.address, TOKEN_40));
			const currentTime = await getTimestamp();
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId2, packageId1, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId2, packageId1, collaborator2.address);

			expect(addedCollaborator1.mgp).to.equal(TOKEN_30);
			expect(addedCollaborator1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.mgp).to.equal(TOKEN_40);
			expect(addedCollaborator2.timeCreated).to.closeTo(currentTime, 10);

			const package1 = await reBakedDAO.getPackageData(projectId2, packageId1);
			expect(package1.budgetAllocated).to.equal(TOKEN_30.add(TOKEN_40));
			expect(package1.totalCollaborators).to.equal(2);
		});

		it("Approve 2 collaborators", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).approveCollaborator(projectId2, packageId1, collaborator1.address));
			await BT.updateFee(reBakedDAO.connect(initiator).approveCollaborator(projectId2, packageId1, collaborator2.address));

			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId2, packageId1, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId2, packageId1, collaborator2.address);

			const currentTime = await getTimestamp();
			expect(addedCollaborator1.timeMgpApproved).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.timeMgpApproved).to.closeTo(currentTime, 10);

			const package1 = await reBakedDAO.getPackageData(projectId2, packageId1);
			expect(package1.approvedCollaborators).to.equal(2);
		});

		it("Add 2 observers", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).addObservers(projectId2, packageId1, [observer1.address, observer2.address]));

			const currentTime = await getTimestamp();
			let addedObserver1 = await reBakedDAO.getObserverData(projectId2, packageId1, observer1.address);
			let addedObserver2 = await reBakedDAO.getObserverData(projectId2, packageId1, observer2.address);
			expect(addedObserver1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedObserver2.timeCreated).to.closeTo(currentTime, 10);

			const package1 = await reBakedDAO.getPackageData(projectId2, packageId1);
			expect(package1.totalObservers).to.equal(2);
		});

		it("Finish package 1", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).finishPackage(projectId2, packageId1, [collaborator1.address, collaborator2.address], [observer1.address, observer2.address], [9 * 1e5, 1e5]));

			const package1 = await reBakedDAO.getPackageData(projectId2, packageId1);
			const currentTime = await getTimestamp();
			expect(package1.isActive).to.be.false;
			expect(package1.timeFinished).to.closeTo(currentTime, 10);

			const project2 = await reBakedDAO.getProjectData(projectId2);
			expect(project2.budgetAllocated).to.equal(TOKEN_100.add(TOKEN_50).add(TOKEN_20));
			expect(project2.totalFinishedPackages).to.equal(1);
		});

		it("Check balance after flow", async () => {
			let project2 = await reBakedDAO.getProjectData(projectId2);

			const flowName = "flow6";
			await initiatorBT.takeSnapshot(flowName);
			await treasuryBT.takeSnapshot(flowName);
			await collaborator1BT.takeSnapshot(flowName);
			await collaborator2BT.takeSnapshot(flowName);
			await collaborator3BT.takeSnapshot(flowName);
			await observer1BT.takeSnapshot(flowName);
			await observer2BT.takeSnapshot(flowName);

			const collaborator1Diff = collaborator1BT.diff("flow5", flowName);
			const collaborator2Diff = collaborator2BT.diff("flow5", flowName);
			const observer1Diff = observer1BT.diff("flow5", flowName);
			const observer2Diff = observer2BT.diff("flow5", flowName);

			expect(collaborator1Diff[project2.token].delta).to.equal(TOKEN_50.add(TOKEN_5.mul(5)));
			expect(collaborator2Diff[project2.token].delta).to.equal(TOKEN_40.add(TOKEN_5));
			expect(observer1Diff[project2.token].delta).to.equal(TOKEN_20.add(TOKEN_5));
			expect(observer2Diff[project2.token].delta).to.equal(TOKEN_20.add(TOKEN_5));
		});
	});

	describe("Cancel package (Project 2 package 2)", () => {
		let packageId2: string;

		it("Add package 2", async () => {
			tx = await BT.updateFee(reBakedDAO.connect(initiator).createPackage(projectId2, TOKEN_100, TOKEN_30, TOKEN_50, 4, []));
			receipt = await tx.wait();
			packageId2 = receipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
			const project2 = await reBakedDAO.getProjectData(projectId2);
			expect(project2.budgetAllocated).to.equal(TOKEN_100.mul(3).add(TOKEN_50));
			expect(project2.totalPackages).to.equal(2);

			const package2 = await reBakedDAO.getPackageData(projectId2, packageId2);
			const currentTime = await getTimestamp();
			expect(package2.budget).to.equal(TOKEN_100);
			expect(package2.bonus).to.equal(TOKEN_30);
			expect(package2.budgetObservers).to.equal(TOKEN_50);
			expect(package2.collaboratorsLimit).to.equal(4);
			expect(package2.isActive).to.be.true;
			expect(package2.timeCreated).to.closeTo(currentTime, 10);
		});

		it("Add 3 collaborators", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId2, packageId2, collaborator1.address, TOKEN_30));
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId2, packageId2, collaborator2.address, TOKEN_30));
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId2, packageId2, collaborator3.address, TOKEN_30));
			const currentTime = await getTimestamp();
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId2, packageId2, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId2, packageId2, collaborator2.address);
			let addedCollaborator3 = await reBakedDAO.getCollaboratorData(projectId2, packageId2, collaborator3.address);

			expect(addedCollaborator1.mgp).to.equal(TOKEN_30);
			expect(addedCollaborator1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.mgp).to.equal(TOKEN_30);
			expect(addedCollaborator2.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator3.mgp).to.equal(TOKEN_30);
			expect(addedCollaborator3.timeCreated).to.closeTo(currentTime, 10);

			const package2 = await reBakedDAO.getPackageData(projectId2, packageId2);
			expect(package2.budgetAllocated).to.equal(TOKEN_30.mul(3));
			expect(package2.totalCollaborators).to.equal(3);
		});

		it("Approve 3 collaborators", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).approveCollaborator(projectId2, packageId2, collaborator1.address));
			await BT.updateFee(reBakedDAO.connect(initiator).approveCollaborator(projectId2, packageId2, collaborator2.address));
			await BT.updateFee(reBakedDAO.connect(initiator).approveCollaborator(projectId2, packageId2, collaborator3.address));

			const addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId2, packageId2, collaborator1.address);
			const addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId2, packageId2, collaborator2.address);
			const addedCollaborator3 = await reBakedDAO.getCollaboratorData(projectId2, packageId2, collaborator3.address);

			const currentTime = await getTimestamp();
			expect(addedCollaborator1.timeMgpApproved).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.timeMgpApproved).to.closeTo(currentTime, 10);
			expect(addedCollaborator3.timeMgpApproved).to.closeTo(currentTime, 10);

			const package2 = await reBakedDAO.getPackageData(projectId2, packageId2);
			expect(package2.approvedCollaborators).to.equal(3);
		});

		it("Add 2 observers", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).addObservers(projectId2, packageId2, [observer1.address, observer2.address]));

			const currentTime = await getTimestamp();
			let addedObserver1 = await reBakedDAO.getObserverData(projectId2, packageId2, observer1.address);
			let addedObserver2 = await reBakedDAO.getObserverData(projectId2, packageId2, observer2.address);
			expect(addedObserver1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedObserver2.timeCreated).to.closeTo(currentTime, 10);

			const package2 = await reBakedDAO.getPackageData(projectId2, packageId2);
			expect(package2.totalObservers).to.equal(2);
		});

		it("Cancel package 2", async () => {
			await BT.expect(reBakedDAO.connect(initiator).cancelPackage(
					projectId2,
					packageId2,
					[collaborator1.address, collaborator2.address, collaborator3.address],
					[observer1.address, observer2.address],
					true
				)).to.emit(reBakedDAO, "CanceledPackage")
						.withArgs(projectId2, packageId2, TOKEN_40)
					.to.emit(reBakedDAO, "PaidCollaboratorRewards")
						.withArgs(projectId2, packageId2, collaborator1.address, TOKEN_30, "0")
					.to.emit(reBakedDAO, "PaidCollaboratorRewards")
						.withArgs(projectId2, packageId2, collaborator2.address, TOKEN_30, "0")
					.to.emit(reBakedDAO, "PaidCollaboratorRewards")
						.withArgs(projectId2, packageId2, collaborator3.address, TOKEN_30, "0")
					.to.emit(reBakedDAO, "PaidObserverFee")
						.withArgs(projectId2, packageId2, observer1.address, TOKEN_20.add(TOKEN_5))
					.to.emit(reBakedDAO, "PaidObserverFee")
						.withArgs(projectId2, packageId2, observer2.address, TOKEN_20.add(TOKEN_5));

			const package2 = await reBakedDAO.getPackageData(projectId2, packageId2);
			const currentTime = await getTimestamp();
			expect(package2.timeCanceled).to.closeTo(currentTime, 10);
			expect(package2.isActive).to.be.false;
			expect(package2.budgetPaid).to.equal(TOKEN_30.mul(3));
			expect(package2.budgetObserversPaid).to.equal(TOKEN_50);

			const project2 = await reBakedDAO.getProjectData(projectId2);
			expect(project2.budgetPaid).to.equal(TOKEN_100.mul(3).add(TOKEN_10));
			expect(project2.totalPackages).to.equal(1);
			expect(project2.budgetAllocated).to.equal(TOKEN_100.mul(3).add(TOKEN_10));

			const addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId2, packageId2, collaborator1.address);
			const addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId2, packageId2, collaborator2.address);
			const addedCollaborator3 = await reBakedDAO.getCollaboratorData(projectId2, packageId2, collaborator3.address);
			expect(addedCollaborator1.timeMgpPaid).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.timeMgpPaid).to.closeTo(currentTime, 10);
			expect(addedCollaborator3.timeMgpPaid).to.closeTo(currentTime, 10);

			const addedObserver1 = await reBakedDAO.getObserverData(projectId2, packageId2, observer1.address);
			const addedObserver2 = await reBakedDAO.getObserverData(projectId2, packageId2, observer2.address);
			expect(addedObserver1.timePaid).to.closeTo(currentTime, 10);
			expect(addedObserver2.timePaid).to.closeTo(currentTime, 10);
		});

		it("Check balance after flow", async () => {
			let project2 = await reBakedDAO.getProjectData(projectId2);

			const flowName = "flow7";
			await initiatorBT.takeSnapshot(flowName);
			await treasuryBT.takeSnapshot(flowName);
			await collaborator1BT.takeSnapshot(flowName);
			await collaborator2BT.takeSnapshot(flowName);
			await collaborator3BT.takeSnapshot(flowName);
			await observer1BT.takeSnapshot(flowName);
			await observer2BT.takeSnapshot(flowName);

			const collaborator1Diff = collaborator1BT.diff("flow6", flowName);
			const collaborator2Diff = collaborator2BT.diff("flow6", flowName);
			const collaborator3Diff = collaborator3BT.diff("flow6", flowName);
			const observer1Diff = observer1BT.diff("flow6", flowName);
			const observer2Diff = observer2BT.diff("flow6", flowName);

			expect(collaborator1Diff[project2.token].delta).to.equal(TOKEN_30);
			expect(collaborator2Diff[project2.token].delta).to.equal(TOKEN_30);
			expect(collaborator3Diff[project2.token].delta).to.equal(TOKEN_30);
			expect(observer1Diff[project2.token].delta).to.equal(TOKEN_20.add(TOKEN_5));
			expect(observer2Diff[project2.token].delta).to.equal(TOKEN_20.add(TOKEN_5));
		});
	});

	describe("Finish project (Project 2)", () => {
		it("Finish project 1", async () => {
			await BT.expect(reBakedDAO.connect(initiator).finishProject(projectId2))
				.to.emit(reBakedDAO, "FinishedProject")
				.withArgs(projectId2, "690000000000000000000");
		});

		it("Check balance after flow", async () => {
			const flowName = "flow8";
			await collaborator1BT.takeSnapshot(flowName);
			await collaborator2BT.takeSnapshot(flowName);
			await collaborator3BT.takeSnapshot(flowName);
			await observer1BT.takeSnapshot(flowName);
			await observer2BT.takeSnapshot(flowName);
			await initiatorBT.takeSnapshot(flowName);
			await treasuryBT.takeSnapshot(flowName);

			const initiatorDiff = initiatorBT.diff("flow7", flowName);

			const project2 = await reBakedDAO.getProjectData(projectId2);
			expect(initiatorDiff[project2.token].delta).to.equal(parseUnits("690", 18));
		});
	});
});

