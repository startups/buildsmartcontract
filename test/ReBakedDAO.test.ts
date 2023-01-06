import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits, formatBytes32String, parseEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ReBakedDAO, ReBakedDAO__factory, IOUToken, IOUToken__factory } from "../typechain-types";
import { ZERO_ADDRESS, MAX_UINT256, getTimestamp, getBlock, solidityKeccak256, skipTime } from "./utils";
import { Result } from "@ethersproject/abi";
import { ContractReceipt, ContractTransaction } from "ethers";

// Contract Factories
let deployer: SignerWithAddress;
let treasury: SignerWithAddress;
let accounts: SignerWithAddress[];
let reBakedDAO: ReBakedDAO;
let iouToken: IOUToken;

// Useful variables
const TOKEN_10 = parseUnits("10", 18);
const TOKEN_20 = parseUnits("20", 18);
const TOKEN_30 = parseUnits("30", 18);
const TOKEN_40 = parseUnits("40", 18);
const TOKEN_50 = parseUnits("50", 18);
const TOKEN_100 = parseUnits("100", 18);
const TOKEN_1000 = parseUnits("1000", 18);
const tokenName = "Pioneer",
	tokenSymbol = "PIO";

let tx: ContractTransaction;
let receipt: ContractReceipt;
let args: Result;
let initiator: SignerWithAddress;
let projectId: string;
let packageId1: string;
let packageId2: string;
let collaborator1: SignerWithAddress;
let collaborator2: SignerWithAddress;
let observer1: SignerWithAddress;
let observer2: SignerWithAddress;

describe("ReBakedDAO", () => {
	beforeEach(async () => {
		[deployer, treasury, ...accounts] = await ethers.getSigners();
		[initiator, collaborator1, collaborator2, observer1, observer2] = accounts;
		const IOUToken = (await ethers.getContractFactory("IOUToken")) as IOUToken__factory;
		const ReBakedDAO = (await ethers.getContractFactory("ReBakedDAO")) as ReBakedDAO__factory;

		iouToken = await IOUToken.deploy(initiator.address, "10000000000000000000000", tokenName, tokenSymbol);
		reBakedDAO = (await upgrades.deployProxy(ReBakedDAO, [treasury.address])) as ReBakedDAO;
		await reBakedDAO.deployed();
	});

	describe("Validating initialized state of contracts", () => {
		let ReBakedDAO: ReBakedDAO__factory;

		beforeEach(async () => {
			ReBakedDAO = (await ethers.getContractFactory("ReBakedDAO")) as ReBakedDAO__factory;
		});

		it("[Fail]: Initialized has been called", async () => {
			await expect(reBakedDAO.initialize(treasury.address)).to.revertedWith("Initializable: contract is already initialized");
		});

		it("[Fail]: Invalid treasury address", async () => {
			await expect(upgrades.deployProxy(ReBakedDAO, [ZERO_ADDRESS])).to.revertedWith("invalid treasury address");
		});

		it("Validating initialized state of ReBakedDAO", async () => {
			expect(await reBakedDAO.PCT_PRECISION()).to.equal(parseUnits("1", 6));
			expect(await reBakedDAO.owner()).to.equal(deployer.address);
			expect(await reBakedDAO.treasury()).to.equal(treasury.address);

			await iouToken.connect(initiator).approve(reBakedDAO.address, "30000000000000000000");
		});
	});

	describe("Testing `updateTreasury` function", () => {
		it("[Fail]: Caller is not the owner", async () => {
			await expect(reBakedDAO.connect(initiator).updateTreasury(accounts[1].address)).to.revertedWith("Ownable: caller is not the owner");
		});

		it("[Fail]: Invalid treasury address", async () => {
			await expect(reBakedDAO.connect(deployer).updateTreasury(ZERO_ADDRESS)).to.revertedWith("invalid treasury address");
		});

		it("[OK]: Update treasury successfully", async () => {
			await reBakedDAO.connect(deployer).updateTreasury(accounts[1].address);
			expect(await reBakedDAO.treasury()).to.equal(accounts[1].address);
			await reBakedDAO.connect(deployer).updateTreasury(accounts[2].address);
			expect(await reBakedDAO.treasury()).to.equal(accounts[2].address);
		});
	});

	describe("Testing `createProject` function", () => {
		describe("Create new project with existed token", () => {
			it("[Fail]: Create new project with zero budget", async () => {
				await expect(reBakedDAO.connect(initiator).createProject(iouToken.address, 0)).to.revertedWith("Zero amount");
			});

			it("[Fail]: Create new project with existed token that has not been approved to transfer", async () => {
				await expect(reBakedDAO.connect(initiator).createProject(iouToken.address, 3000)).to.revertedWith("ERC20: insufficient allowance");
			});

			it("[Fail]: Create new project with zero address", async () => {
				await expect(reBakedDAO.connect(initiator).createProject(ZERO_ADDRESS, 3000)).to.revertedWith("Invalid token address");
			});

			it("[OK]: Create new project successfully", async () => {
				await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);

				const budget = TOKEN_100;

				const tx: ContractTransaction = await reBakedDAO.connect(initiator).createProject(iouToken.address, budget);
				const receipt: ContractReceipt = await tx.wait();

				const args: Result = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
				const projectId = args[0];
				const project = await reBakedDAO.getProjectData(projectId);
				const timestamp: number = await getTimestamp();

				expect(projectId).to.equal(solidityKeccak256(["address", "uint256", "uint256"], [initiator.address, (await getBlock(tx.blockHash!)).parentHash, 0]));
				expect(project.initiator).to.equal(initiator.address);
				expect(project.token).to.equal(iouToken.address);
				expect(project.budget).to.equal(budget);
				expect(project.timeCreated).to.closeTo(timestamp, 10);
			});

			it("[OK]: Token balance has been changed after creating project", async () => {
				await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
				await expect(reBakedDAO.connect(initiator).createProject(iouToken.address, 100)).changeTokenBalances(iouToken, [initiator, reBakedDAO], [-100, 100]);
			});
		});
	});

	describe("Testing `createPackage` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];
		});

		it("[Fail]: Caller is not initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).createPackage(projectId, TOKEN_100, 10, 40, 5, [])).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Create new package with budget equal to 0", async () => {
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, 0, 10, 40, 5, [])).to.revertedWith("Zero amount");
		});

		it("[Fail]: Project has been finished", async () => {
			await reBakedDAO.connect(initiator).finishProject(projectId);
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, [])).to.revertedWith("project is finished");
		});

		it("[Fail]: Project budget left is not enough", async () => {
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("990", 18), TOKEN_10, TOKEN_40, 5, [])).to.revertedWith("not enough project budget left");
		});

		it("[Fail]: Incorrect max collaborators (require 0 < collaboratorsLimit <= 10)", async () => {
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 0, [])).to.revertedWith("incorrect collaborators limit");
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 11, [])).to.revertedWith("incorrect collaborators limit");
		});

		it("[OK]: Create new package successfully", async () => {
			tx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 3, []);
			receipt = await tx.wait();
			let packageId: string = receipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
			let createdPackage = await reBakedDAO.getPackageData(projectId, packageId);
			let timestamp = await getTimestamp();

			expect(packageId).to.equal(solidityKeccak256(["address", "uint256", "uint256"], [initiator.address, (await getBlock(tx.blockHash!)).parentHash, 0]));
			expect(createdPackage.budget).to.equal(TOKEN_100);
			expect(createdPackage.budgetObservers).to.equal(TOKEN_40);
			expect(createdPackage.bonus).to.equal(TOKEN_10);
			expect(createdPackage.timeCreated).to.closeTo(timestamp, 10);
			expect(createdPackage.isActive).to.be.true;

			let currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetAllocated).to.equal(parseUnits("150", 18));
			expect(currentProject.totalPackages).to.equal(1);

			// package 2
			tx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 3, [observer1.address]);
			receipt = await tx.wait();
			packageId = receipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
			createdPackage = await reBakedDAO.getPackageData(projectId, packageId);
			timestamp = await getTimestamp();

			expect(packageId).to.equal(solidityKeccak256(["address", "uint256", "uint256"], [initiator.address, (await getBlock(tx.blockHash!)).parentHash, 0]));
			expect(createdPackage.budget).to.equal(TOKEN_100);
			expect(createdPackage.budgetObservers).to.equal(TOKEN_40);
			expect(createdPackage.bonus).to.equal(TOKEN_10);
			expect(createdPackage.timeCreated).to.closeTo(timestamp, 10);
			expect(createdPackage.isActive).to.be.true;

			currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetAllocated).to.equal(parseUnits("300", 18));
			expect(currentProject.totalPackages).to.equal(2);
		});
	});

	describe("Testing `addCollaborator` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 3, []);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Add collaborator with mgp zero", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, 0)).to.revertedWith("Zero amount");
		});

		it("[Fail]: Add collaborator with zero address", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, ZERO_ADDRESS, TOKEN_10)).to.revertedWith("collaborator's address is zero");
		});

		it("[Fail]: Collaborator has been added", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10)).to.revertedWith("collaborator already added");
		});

		it("[Fail]: Package is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, formatBytes32String("test"), collaborator1.address, TOKEN_10)).to.revertedWith("no such package");
		});

		it("[Fail]: Package has been canceled", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [], [], true);
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10)).to.revertedWith("no such package");
		});

		it("[Fail]: Package has been finished", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [], [], []);
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10)).to.revertedWith("no such package");
		});

		it("[Fail]: Package budget is not enough to pay mgp", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, parseUnits("101", 18))).to.revertedWith("not enough package budget left");
		});

		it("[Fail]: Exceed max collaborators", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, accounts[15].address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, accounts[16].address, TOKEN_10);
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, accounts[17].address, TOKEN_10)).to.revertedWith("collaborators limit reached");
		});

		it("[OK]: Add collaborator successfully", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10))
				.to.emit(reBakedDAO, "AddedCollaborator")
				.withArgs(projectId, packageId1, collaborator1.address, TOKEN_10);
			const addedCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(addedCollaborator.mgp).to.equal(TOKEN_10);
			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.budgetAllocated).to.equal(TOKEN_10);
			expect(currentPackage.totalCollaborators).to.equal(1);

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
			await reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator2.address, true);

			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_20))
				.to.emit(reBakedDAO, "AddedCollaborator")
				.withArgs(projectId, packageId1, collaborator2.address, TOKEN_20);
			const addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			expect(addedCollaborator2.mgp).to.equal(TOKEN_20);
			currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.budgetAllocated).to.equal(TOKEN_40);
			expect(currentPackage.totalCollaborators).to.equal(2);
		});
	});

	describe("Testing `approveCollaborator` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).approveCollaborator(projectId, packageId1, collaborator1.address)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Collaborator has not been added", async () => {
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address)).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Package is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address], [], true);
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address)).to.revertedWith("no such package");
		});

		it("[Fail]: Collaborator has been approved", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address)).to.revertedWith("collaborator already approved");
		});

		it("[OK]: Approve collaborator successfully", async () => {
			// Collaborator 1
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address))
				.to.emit(reBakedDAO, "ApprovedCollaborator")
				.withArgs(projectId, packageId1, collaborator1.address);
			const timestamp = await getTimestamp();

			const currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(currentCollaborator.timeMgpApproved).to.closeTo(timestamp, 10);

			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.approvedCollaborators).to.equal(1);

			// Collaborator 2
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address))
				.to.emit(reBakedDAO, "ApprovedCollaborator")
				.withArgs(projectId, packageId1, collaborator2.address);

			const currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			expect(currentCollaborator2.timeMgpApproved).to.closeTo(timestamp, 10);

			currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.approvedCollaborators).to.equal(2);
		});
	});

	describe("Testing `removeCollaborator` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
		});

		it("[Fail]: Caller is not project initiator", async () => {
			await expect(reBakedDAO.connect(accounts[1]).removeCollaborator(projectId, packageId1, collaborator1.address, true)).to.revertedWith("caller is not project initiator");
			await expect(reBakedDAO.connect(collaborator2).removeCollaborator(projectId, packageId1, collaborator1.address, true)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Remove collaborator but he/she has been approved", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator1.address, true)).to.revertedWith("collaborator approved already!");
		});

		it("[Fail]: Remove collaborator but collaborator has claimed reward", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [], true);
			await expect(reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator1.address, true)).to.revertedWith("reward already paid");
		});

		it("[OK]: Remove collaborator successfully", async () => {
			await expect(reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator1.address, true))
				.to.emit(reBakedDAO, "RemovedCollaborator")
				.withArgs(projectId, packageId1, collaborator1.address);

			const collaboratorData = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(collaboratorData.isRemoved).to.be.true;

			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.budgetPaid).to.equal(collaboratorData.mgp);
			let currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetPaid).to.equal(collaboratorData.mgp);

			await expect(reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator2.address, false))
				.to.emit(reBakedDAO, "RemovedCollaborator")
				.withArgs(projectId, packageId1, collaborator2.address);
		});
	});

	describe("Testing `selfRemove` function", async () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
		});

		it("[Fail]: Collaborator is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).selfRemove(projectId, packageId1)).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Collaborator has been approved", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(collaborator1).selfRemove(projectId, packageId1)).to.revertedWith("collaborator approved already!");
		});

		it("[Fail]: Collaborator self remove from package but package is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address], [], true);
			await expect(reBakedDAO.connect(collaborator1).selfRemove(projectId, packageId1)).to.revertedWith("no such package");
		});

		it("[OK]: Collaborator self remove from package successfully", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_20);

			// Collaborator 1
			await reBakedDAO.connect(collaborator1).selfRemove(projectId, packageId1);
			const currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(currentCollaborator.mgp).to.equal(TOKEN_10);
			expect(currentCollaborator.isRemoved).to.be.true;
			expect(currentCollaborator.timeMgpApproved).to.equal(0);

			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.budgetAllocated).to.equal(TOKEN_20);
			expect(currentPackage.totalCollaborators).to.equal(1);
			expect(currentPackage.approvedCollaborators).to.equal(0);

			// Collaborator 2
			await reBakedDAO.connect(collaborator2).selfRemove(projectId, packageId1);
			const currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			expect(currentCollaborator2.mgp).to.equal(TOKEN_20);
			expect(currentCollaborator2.isRemoved).to.be.true;
			expect(currentCollaborator2.timeMgpApproved).to.equal(0);

			currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.budgetAllocated).to.equal(0);
			expect(currentPackage.totalCollaborators).to.equal(0);
			expect(currentPackage.approvedCollaborators).to.equal(0);
		});
	});

	describe("Testing `finishPackage` function", async () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_10, 0, 0, 5, []);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId2, collaborator1.address, TOKEN_10);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).finishPackage(projectId, packageId1, [collaborator1.address], [], [])).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Finish package but package is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, formatBytes32String("test"), [], [], [])).to.revertedWith("no such package");
		});

		it("[Fail]: Finish package but package is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address], [], true);
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [], [1e6])).to.revertedWith("no such package");
		});

		it("[Fail]: Finish package but package has been finished", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [], [1e6]);
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [], [1e6])).to.revertedWith("no such package");
		});

		it("[Fail]: Finish package but package still has unapproved collaborators left", async () => {
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [], [1e6])).to.revertedWith("unapproved collaborators left");
		});

		it("[Fail]: Finish package but invalid collaborators list", async () => {
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [], [], [1e6])).to.revertedWith("invalid collaborators list");
		});

		it("[Fail]: Finish package but invalid collaborators list", async () => {
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [observer1.address], [1e6])).to.revertedWith("invalid observers list");
		});

		it("[Fail]: Finish package but invalid collaborators list", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [], [])).to.revertedWith("arrays' length mismatch");
		});

		it("[Fail]: Incorrect total bonus scores", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [], [1e5])).to.revertedWith("incorrect total bonus scores");
		});

		it("[Fail]: Finish package but collaborator is not valid", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator2.address], [], [1e6])).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Invalid score", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);

			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [], [1e6, 0])).to.revertedWith("invalid bonus score");
		});

		it("[OK]: Finish package successfully", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);

			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [], [5 * 1e5, 5 * 1e5]))
				.to.emit(reBakedDAO, "FinishedPackage")
				.withArgs(projectId, packageId1, parseUnits("120", 18));

			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			let timestamp = await getTimestamp();
			expect(currentPackage.timeFinished).to.closeTo(timestamp, 10);

			let currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetAllocated).to.equal(TOKEN_40);
			expect(currentProject.totalFinishedPackages).to.equal(1);

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId2, collaborator1.address);

			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId2, [collaborator1.address], [], [1e6]))
				.to.emit(reBakedDAO, "FinishedPackage")
				.withArgs(projectId, packageId2, 0);
			currentPackage = await reBakedDAO.getPackageData(projectId, packageId2);
			timestamp = await getTimestamp();
			expect(currentPackage.timeFinished).to.closeTo(timestamp, 10);

			currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetAllocated).to.equal(TOKEN_40);
			expect(currentProject.totalFinishedPackages).to.equal(2);
		});
	});

	describe("Testing `cancelPackage` function", async () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).cancelPackage(projectId, packageId1, [], [], true))
				.to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Cancel package but package is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, formatBytes32String("test"), [], [], true))
				.to.revertedWith("no such package");
		});

		it("[Fail]: Cancel package but package is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [], true);
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [], true)).to.revertedWith("no such package");
		});

		it("[Fail]: Cancel package but package has been finished", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [], [3 * 1e5, 7 * 1e5]);
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [], true)).to.revertedWith("no such package");
		});

		it("[Fail]: Cancel package but with invalid collaborators length", async () => {
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator2.address], [], true)).to.revertedWith("invalid collaborators length");
		});

		it("[Fail]: Cancel package but with invalid observers length", async () => {
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address]);
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [], true)).to.revertedWith("invalid observers length");
		});

		it("[Fail]: Cancel package but collaborator is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [accounts[9].address, collaborator2.address], [], true)).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Cancel package but observer is not existed", async () => {
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address]);
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [accounts[9].address], true)).to.revertedWith("no such observer");
		});

		it("[OK]: Cancel package with workStarted == true successfully", async () => {
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address]);
			await expect(reBakedDAO.connect(initiator).cancelPackage(
				projectId,
				packageId1,
				[collaborator1.address, collaborator2.address],
				[observer1.address],
				true
			)).to.emit(reBakedDAO, "CanceledPackage")
					.withArgs(projectId, packageId1, parseUnits("90", 18))
				.to.emit(reBakedDAO, "PaidCollaboratorRewards")
					.withArgs(projectId, packageId1, collaborator1.address, TOKEN_10, "0")
				.to.emit(reBakedDAO, "PaidCollaboratorRewards")
					.withArgs(projectId, packageId1, collaborator2.address, TOKEN_10, "0")
				.to.emit(reBakedDAO, "PaidObserverFee")
					.withArgs(projectId, packageId1, observer1.address, TOKEN_40);

			const currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			const timestamp = await getTimestamp();
			expect(currentPackage.timeCanceled).to.closeTo(timestamp, 10);
			expect(currentPackage.isActive).to.be.false;

			let currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.totalPackages).to.equal(0);
			expect(currentProject.budgetAllocated).to.equal(parseUnits("60", 18));
		});

		it("[OK]: Cancel package with workStarted == true and 0 observers", async () => {
			await expect(reBakedDAO.connect(initiator).cancelPackage(
				projectId,
				packageId1,
				[collaborator1.address, collaborator2.address],
				[],
				true
			)).to.emit(reBakedDAO, "CanceledPackage")
					.withArgs(projectId, packageId1, parseUnits("130", 18))
				.to.emit(reBakedDAO, "PaidCollaboratorRewards")
					.withArgs(projectId, packageId1, collaborator1.address, TOKEN_10, "0")
				.to.emit(reBakedDAO, "PaidCollaboratorRewards")
					.withArgs(projectId, packageId1, collaborator2.address, TOKEN_10, "0")
				.to.not.emit(reBakedDAO, "PaidObserverFee");

			const currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			const timestamp = await getTimestamp();
			expect(currentPackage.timeCanceled).to.closeTo(timestamp, 10);
			expect(currentPackage.isActive).to.be.false;

			let currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.totalPackages).to.equal(0);
			expect(currentProject.budgetAllocated).to.equal(parseUnits("20", 18));

			const packageTx2: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_40, TOKEN_30, 1, []);
			const packageReceipt2: ContractReceipt = await packageTx2.wait();
			packageId2 = packageReceipt2.events!.find(ev => ev.event === "CreatedPackage")!.args![1];
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId2, collaborator2.address, TOKEN_20);

			await expect(
				reBakedDAO.connect(initiator).cancelPackage(projectId, packageId2, [collaborator2.address], [], true)
			).to.emit(reBakedDAO, "CanceledPackage")
				.withArgs(projectId, packageId2, parseUnits("150", 18));

			const currentPackage2 = await reBakedDAO.getPackageData(projectId, packageId2);
			const timestamp2 = await getTimestamp();
			expect(currentPackage2.timeCanceled).to.closeTo(timestamp2, 10);
			expect(currentPackage2.isActive).to.be.false;
			expect(currentPackage2.budgetPaid).to.eq(TOKEN_20);
			expect(currentPackage2.bonusPaid).to.eq("0");
			expect(currentPackage2.budgetObserversPaid).to.eq("0");

			currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.totalPackages).to.equal(0);
			expect(currentProject.budgetAllocated).to.equal(TOKEN_40);
			expect(currentProject.budgetPaid).to.equal(TOKEN_40);
		});

		it("[OK]: Cancel package with workStarted == false successfully", async () => {
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address]);
			await expect(
				reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [observer1.address], false)
			).to.emit(reBakedDAO, "CanceledPackage")
				.withArgs(projectId, packageId1, TOKEN_100.add(TOKEN_10).add(TOKEN_40))
				.to.not.emit(reBakedDAO, "PaidCollaboratorRewards")
				.to.not.emit(reBakedDAO, "PaidObserverFee");

			const currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			const timestamp = await getTimestamp();
			expect(currentPackage.timeCanceled).to.closeTo(timestamp, 10);
			expect(currentPackage.isActive).to.be.false;

			let currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetAllocated).to.equal("0");
			expect(currentProject.totalPackages).to.equal(0);
		});
	});

	describe("Testing `finishProject` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).finishProject(projectId)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Finish project but project has been finished before", async () => {
			await reBakedDAO.connect(initiator).finishProject(projectId);
			await expect(reBakedDAO.connect(initiator).finishProject(projectId)).to.revertedWith("already finished project");
		});

		it("[Fail]: Finish project but project still has unfinished packages left", async () => {
			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);

			await expect(reBakedDAO.connect(initiator).finishProject(projectId)).to.revertedWith("unfinished packages left");
		});

		it("[OK]: Finish project that does not have own token successfully", async () => {
			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [], [3 * 1e5, 7 * 1e5]);

			expect(reBakedDAO.connect(initiator).finishProject(projectId))
				.to.emit(reBakedDAO, "FinishedProject")
				.withArgs(projectId, "970000000000000000000");
			const timestamp = await getTimestamp();
			const currentProject = await reBakedDAO.getProjectData(projectId);

			expect(currentProject.timeFinished).to.closeTo(timestamp, 10);
		});

		it("[OK]: Finish project that has own token successfully", async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			const tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			const receipt = await tx.wait();
			const args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			const projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			const packageId = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator2.address, TOKEN_10);

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator2.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId, [collaborator1.address, collaborator2.address], [], [1e5, 9 * 1e5]);

			await expect(reBakedDAO.connect(initiator).finishProject(projectId))
				.to.emit(reBakedDAO, "FinishedProject")
				.withArgs(projectId)
				.to.changeTokenBalances(iouToken, [initiator], [parseUnits("970", 18)]);

			const currentProject = await reBakedDAO.getProjectData(projectId);
			const timestamp = await getTimestamp();
			expect(currentProject.timeFinished).to.closeTo(timestamp, 10);
		});

		it("[OK]: Finish project with zero budget left", async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			const tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			const receipt = await tx.wait();
			const args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			const projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_1000, 0, 0, 5, []);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			const packageId = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator1.address, TOKEN_1000);

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator1.address);

			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId, [collaborator1.address], [], [1e6]);
			await reBakedDAO.connect(initiator).finishProject(projectId);

			const currentProject = await reBakedDAO.getProjectData(projectId);
			const timestamp = await getTimestamp();
			expect(currentProject.timeFinished).to.closeTo(timestamp, 10);
		});
	});

	describe("Testing `addObservers` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).addObservers(projectId, packageId1, [observer1.address])).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Add observer with zero address", async () => {
			await expect(reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [ZERO_ADDRESS])).to.revertedWith("zero observer's address!");
		});

		it("[Fail]: Observer has been added", async () => {
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address]);
			await expect(reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address])).to.revertedWith("observer already added");
		});

		it("[Fail]: Add observer to a package that is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).addObservers(projectId, formatBytes32String("test"), [observer1.address])).to.revertedWith("no such package");
		});

		it("[Fail]: Add observer to a package that is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address], [], true);
			await expect(reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address])).to.revertedWith("no such package");
		});

		it("[Fail]: Add observer to a package that has been finished", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [], [1e6]);
			await expect(reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address])).to.revertedWith("no such package");
		});

		it("[Fail]: Add observer exceeding max observer", async () => {
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId1, accounts.slice(4, 14).map(e => e.address));
			await expect(reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [accounts[15].address])).to.revertedWith("max observers reached");
		});

		it("[Fail]: Add observer but revert with empty observers array!", async () => {
			await expect(reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [])).to.revertedWith("empty observers array!");
		});

		it("[OK]: Add observer successfully", async () => {
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address]);
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId2, [observer1.address]);
			
			let timestamp = await getTimestamp();
			const addedObserver11 = await reBakedDAO.getObserverData(projectId, packageId1, observer1.address);
			let package1 = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(addedObserver11.timeCreated).to.closeTo(timestamp, 10);
			expect(package1.totalObservers).to.equal(1);

			const addedObserver12 = await reBakedDAO.getObserverData(projectId, packageId2, observer1.address);
			let package2 = await reBakedDAO.getPackageData(projectId, packageId2);
			expect(addedObserver12.timeCreated).to.closeTo(timestamp, 10);
			expect(package2.totalObservers).to.equal(1);

			await reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer2.address]);
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId2, [observer2.address]);

			timestamp = await getTimestamp();
			const addedObserver21 = await reBakedDAO.getObserverData(projectId, packageId1, observer2.address);
			package1 = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(addedObserver21.timeCreated).to.closeTo(timestamp, 10);
			expect(package1.totalObservers).to.equal(2);

			const addedObserver22 = await reBakedDAO.getObserverData(projectId, packageId2, observer2.address);
			package2 = await reBakedDAO.getPackageData(projectId, packageId2);
			expect(addedObserver22.timeCreated).to.closeTo(timestamp, 10);
			expect(package2.totalObservers).to.equal(2);
		});
	});

	describe("addObservers", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).addObservers(projectId, packageId1, [observer1.address])).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Revert with empty observers array!", async () => {
			await expect(reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [])).to.revertedWith("empty observers array!");
		});

		it("[Fail]: Revert with observer's address is zero", async () => {
			await expect(reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [ZERO_ADDRESS])).to.revertedWith("zero observer's address!");
		});

		it("[OK]: Add observers successfully", async () => {
			await expect(reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address, observer2.address])).to.emit(reBakedDAO, "AddedObservers");
		});
	});

	describe("Testing `removeObservers` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);

			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address, observer2.address]);
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId2, [observer1.address]);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).removeObservers(projectId, packageId1, [observer1.address]))
				.to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Remove observer from a package that is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address], [observer1.address, observer2.address], true);
			await expect(reBakedDAO.connect(initiator).removeObservers(projectId, packageId1, [observer1.address])).to.revertedWith("no such package");
		});

		it("[Fail]: Remove observer from a package that has been finished", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [observer1.address, observer2.address], [1e6]);
			await expect(reBakedDAO.connect(initiator).removeObservers(projectId, packageId1, [observer1.address])).to.revertedWith("no such package");
		});

		it("[Fail]: Remove invalid observer", async () => {
			await expect(reBakedDAO.connect(initiator).removeObservers(projectId, packageId2, [observer2.address])).to.revertedWith("no such observer");
		});

		it("[OK]: Remove observer successfully", async () => {
			await reBakedDAO.connect(initiator).removeObservers(projectId, packageId1, [observer1.address]);
			let package1 = await reBakedDAO.getPackageData(projectId, packageId1);
			let package2 = await reBakedDAO.getPackageData(projectId, packageId2);
			expect(package1.totalObservers).to.equal(1);
			expect(package2.totalObservers).to.equal(1);

			await reBakedDAO.connect(initiator).removeObservers(projectId, packageId1, [observer2.address]);
			await reBakedDAO.connect(initiator).removeObservers(projectId, packageId2, [observer1.address]);
			package1 = await reBakedDAO.getPackageData(projectId, packageId1);
			package2 = await reBakedDAO.getPackageData(projectId, packageId2);
			expect(package1.totalObservers).to.equal(0);
			expect(package2.totalObservers).to.equal(0);
		});
	});

	describe("removeObservers", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);

			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address, observer2.address]);
			await reBakedDAO.connect(initiator).addObservers(projectId, packageId2, [observer1.address]);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).removeObservers(projectId, packageId1, [observer1.address])).to.revertedWith("caller is not project initiator");
		});
	});

	describe("Testing get functions", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find(ev => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5, []);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_30, 5, []);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find(ev => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_20);
			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);

			await reBakedDAO.connect(initiator).addObservers(projectId, packageId1, [observer1.address]);
		});

		it("Testing `getProjectData` function", async () => {
			const currentProject = await reBakedDAO.getProjectData(projectId);
			const timestamp = await getTimestamp();
			expect(currentProject.budget).equal(TOKEN_1000);
			expect(currentProject.timeCreated).to.closeTo(timestamp, 10);
			expect(currentProject.token).to.equal(iouToken.address);
		});

		it("Testing `getPackageData` function", async () => {
			const currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			const timestamp = await getTimestamp();
			expect(currentPackage.timeCreated).to.closeTo(timestamp, 10);
			expect(currentPackage.budget).to.equal(TOKEN_100);
			expect(currentPackage.budgetAllocated).to.equal(TOKEN_20);
			expect(currentPackage.bonus).to.equal(TOKEN_10);
			expect(currentPackage.budgetObservers).to.equal(TOKEN_40);
		});

		it("Testing `getCollaboratorData` function", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [observer1.address], [1e6]);
			const currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(currentCollaborator.mgp).to.equal(TOKEN_20);
			expect(currentCollaborator.bonus).to.equal(TOKEN_10);
		});

		it("Testing `getCollaboratorRewards` function", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_20);
			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);

			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [observer1.address], [2 * 1e5, 8 * 1e5]);
			let [mgp, bonus] = await reBakedDAO.getCollaboratorRewards(projectId, packageId1, collaborator1.address);
			expect(mgp).to.equal(TOKEN_20);
			expect(bonus).to.equal(parseEther("2"));

			[mgp, bonus] = await reBakedDAO.getCollaboratorRewards(projectId, formatBytes32String("test"), collaborator1.address);
			expect(mgp).to.equal(0);
			expect(bonus).to.equal(0);

			[mgp, bonus] = await reBakedDAO.getCollaboratorRewards(projectId, packageId1, accounts[9].address);
			expect(mgp).to.equal(0);
			expect(bonus).to.equal(0);
		});

		it("Testing `getObserverData` function", async () => {
			const currentObserver = await reBakedDAO.getObserverData(projectId, packageId1, observer1.address);
			const timestamp = await getTimestamp();
			expect(currentObserver.timeCreated).to.closeTo(timestamp, 10);
		});

		describe("Testing `getObserverFee` function", async () => {
			it("[OK]: Observer has been paid fee", async () => {
				await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [observer1.address], [1e6]);
				const observerFee = await reBakedDAO.getObserverFee(projectId, packageId1, observer1.address);
				expect(observerFee).to.equal(0);
			});

			it("[OK]: Observer has not been added to package", async () => {
				const observerFee = await reBakedDAO.getObserverFee(projectId, packageId1, accounts[9].address);
				expect(observerFee).to.equal(0);
			});

			it("[OK]: Observer has been remove from package", async () => {
				await reBakedDAO.connect(initiator).removeObservers(projectId, packageId1, [observer1.address]);
				const observerFee = await reBakedDAO.getObserverFee(projectId, packageId1, observer1.address);
				expect(observerFee).to.equal(0);
			});

			it("[OK]: Package does not have observer", async () => {
				const observerFee = await reBakedDAO.getObserverFee(projectId, packageId2, observer1.address);
				expect(observerFee).to.equal(0);
			});

			it("[OK]: Observer has claimed fee", async () => {
				await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1, [collaborator1.address], [observer1.address], [1e6]);
				const observerFee = await reBakedDAO.getObserverFee(projectId, packageId2, observer1.address);
				expect(observerFee).to.equal(0);
			});

			it("[OK]: Get observer fee", async () => {
				const observerFee = await reBakedDAO.getObserverFee(projectId, packageId1, observer1.address);
				expect(observerFee).to.equal(TOKEN_40);
			});
		});
	});
});

