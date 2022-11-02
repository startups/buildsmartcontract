import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits, formatBytes32String, parseEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ReBakedDAO, ReBakedDAO__factory, TokenFactory, TokenFactory__factory, IOUToken, IOUToken__factory } from "../../typechain-types";
import { Result } from "@ethersproject/abi";
import { ContractReceipt, ContractTransaction } from "ethers";
import { ZERO_ADDRESS, MAX_UINT256, getTimestamp, getBlock, solidityKeccak256, skipTime, BalanceTracker as BT } from "../utils";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";

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

describe("ReBakedDAO", () => {
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

	it("Verify contract parameter", async () => {
		// Verify contract parameters
		expect(await tokenFactory.reBakedDao()).to.equal(reBakedDAO.address);
		expect(await reBakedDAO.treasury()).to.equal(treasury.address);
		expect(await reBakedDAO.tokenFactory()).to.equal(tokenFactory.address);
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
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId1, collaborator1.address, TOKEN_10));
			await BT.updateFee(reBakedDAO.connect(initiator).addCollaborator(projectId1, packageId1, collaborator2.address, TOKEN_10.add(TOKEN_5)));

			await BT.updateFee(reBakedDAO.connect(initiator).approveCollaborator(projectId1, packageId1, collaborator1.address));
			await BT.updateFee(reBakedDAO.connect(initiator).approveCollaborator(projectId1, packageId1, collaborator2.address));

			const currentTime = await getTimestamp();
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator2.address);
			expect(addedCollaborator1.mgp).to.equal(TOKEN_10);
			expect(addedCollaborator1.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator1.timeMgpApproved).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.mgp).to.equal(TOKEN_10.add(TOKEN_5));
			expect(addedCollaborator2.timeCreated).to.closeTo(currentTime, 10);
			expect(addedCollaborator2.timeMgpApproved).to.closeTo(currentTime, 10);

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			expect(package1.budgetAllocated).to.equal(TOKEN_20.add(TOKEN_5));
			expect(package1.approvedCollaborators).to.equal(2);
		});

		it("Add 2 observers", async () => {
			await BT.updateFee(reBakedDAO.connect(initiator).addObserver(projectId1, [packageId1], observer1.address));
			await BT.updateFee(reBakedDAO.connect(initiator).addObserver(projectId1, [packageId1], observer2.address));
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
			await BT.updateFee(reBakedDAO.connect(initiator).finishPackage(projectId1, packageId1));
			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			const currentTime = await getTimestamp();
			expect(package1.isActive).to.be.false;
			expect(package1.timeFinished).to.closeTo(currentTime, 10);

			const project1 = await reBakedDAO.getProjectData(projectId1);
			expect(project1.budgetAllocated).to.equal(TOKEN_50.add(TOKEN_20).add(TOKEN_5));
			expect(project1.totalFinishedPackages).to.equal(1);
		});

		it("Set Bonus Score to Collaborator 1", async () => {
			await reBakedDAO.connect(owner).setBonusScores(projectId1, packageId1, [collaborator1.address], [1e6]);
			const addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator1.address);
			expect(addedCollaborator1.bonusScore).to.equal(1e6);

			const package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			expect(package1.collaboratorsGetBonus).to.equal(1);
		});

		it("Pay mgp to 2 collaborators", async () => {
			let addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator1.address);
			let addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator2.address);

			await BT.expect(reBakedDAO.connect(initiator).payMgp(projectId1, packageId1, collaborator1.address)).to.changeTokenBalances(
				iouToken,
				[reBakedDAO.address, collaborator1.address],
				[`-${addedCollaborator1.mgp}`, addedCollaborator1.mgp]
			);
			await BT.expect(reBakedDAO.connect(initiator).payMgp(projectId1, packageId1, collaborator2.address)).to.changeTokenBalances(
				iouToken,
				[reBakedDAO.address, collaborator2.address],
				[`-${addedCollaborator2.mgp}`, addedCollaborator2.mgp]
			);
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
			await BT.expect(reBakedDAO.connect(initiator).payObserverFee(projectId1, packageId1, observer1.address)).to.changeTokenBalances(iouToken, [reBakedDAO.address, observer1.address], [`-${observerFee}`, observerFee]);
			await BT.expect(reBakedDAO.connect(initiator).payObserverFee(projectId1, packageId1, observer2.address)).to.changeTokenBalances(iouToken, [reBakedDAO.address, observer2.address], [`-${observerFee}`, observerFee]);

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
			let package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
			const collaborator1Reward = await reBakedDAO.getCollaboratorRewards(projectId1, packageId1, collaborator1.address);
			await BT.expect(reBakedDAO.connect(collaborator1).claimBonus(projectId1, packageId1)).to.changeTokenBalances(iouToken, [reBakedDAO.address, collaborator1.address], [`-${collaborator1Reward[1]}`, collaborator1Reward[1]]);

			const currentTime = await getTimestamp();
			const addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId1, packageId1, collaborator1.address);
			expect(addedCollaborator1.timeBonusPaid).to.closeTo(currentTime, 10);

			package1 = await reBakedDAO.getPackageData(projectId1, packageId1);
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
            const flowName = 'flow2';
            await collaborator1BT.takeSnapshot(flowName);
            await collaborator2BT.takeSnapshot(flowName);
            await observer1BT.takeSnapshot(flowName);
            await observer2BT.takeSnapshot(flowName);

            const collaborator1Diff = collaborator1BT.diff("begin", flowName);
            const collaborator2Diff = collaborator2BT.diff("begin", flowName);
            const observer1BTDiff = observer1BT.diff("begin", flowName);
            const observer2BTDiff = observer2BT.diff("begin", flowName);

            expect(collaborator1Diff[iouToken.address].delta).to.equal(TOKEN_20);
            expect(collaborator2Diff[iouToken.address].delta).to.equal(TOKEN_10.add(TOKEN_5));
            expect(observer1BTDiff[iouToken.address].delta).to.equal(TOKEN_20);
            expect(observer2BTDiff[iouToken.address].delta).to.equal(TOKEN_20);
        })
	});
});
