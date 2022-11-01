import { expect } from "chai";
import { ethers } from "hardhat";
import { parseUnits, formatBytes32String, parseEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ReBakedDAO, ReBakedDAO__factory, TokenFactory, TokenFactory__factory, IOUToken, IOUToken__factory } from "../typechain-types";
import { ZERO_ADDRESS, MAX_UINT256, getTimestamp, getBlock, solidityKeccak256, skipTime } from "./utils";
import { Result } from "@ethersproject/abi";
import { ContractReceipt, ContractTransaction } from "ethers";

// Contract Factories
let deployer: SignerWithAddress;
let treasury: SignerWithAddress;
let accounts: SignerWithAddress[];
let reBakedDAO: ReBakedDAO;
let tokenFactory: TokenFactory;
let iouToken: IOUToken;

// Useful variables
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
		const TokenFactory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
		const IOUToken = (await ethers.getContractFactory("IOUToken")) as IOUToken__factory;
		const ReBakedDAO = (await ethers.getContractFactory("ReBakedDAO")) as ReBakedDAO__factory;

		tokenFactory = await TokenFactory.deploy();
		iouToken = await IOUToken.deploy(initiator.address, "10000000000000000000000");
		reBakedDAO = await ReBakedDAO.deploy(treasury.address, tokenFactory.address);

		// Early transactions
		await tokenFactory.setReBakedDao(reBakedDAO.address);
	});

	describe("Validating initialized state of contracts", () => {
		let ReBakedDAO: ReBakedDAO__factory;

		beforeEach(async () => {
			ReBakedDAO = (await ethers.getContractFactory("ReBakedDAO")) as ReBakedDAO__factory;
		});

		it("[Fail]: Invalid treasury address", async () => {
			await expect(ReBakedDAO.deploy(ZERO_ADDRESS, tokenFactory.address)).to.revertedWith("invalid treasury address");
		});

		it("[Fail]: Invalid tokenFactory address", async () => {
			await expect(ReBakedDAO.deploy(treasury.address, ZERO_ADDRESS)).to.revertedWith("invalid tokenFactory address");
		});

		it("Validating initialized state of ReBakedDAO", async () => {
			expect(await reBakedDAO.PCT_PRECISION()).to.equal(parseUnits("1", 6));
			expect(await reBakedDAO.owner()).to.equal(deployer.address);
			expect(await reBakedDAO.treasury()).to.equal(treasury.address);

			await iouToken.connect(initiator).approve(reBakedDAO.address, "30000000000000000000");
			expect(await tokenFactory.reBakedDao()).to.equal(reBakedDAO.address);
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

			it("[OK]: Create new project successfully", async () => {
				await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);

				const budget = TOKEN_100;

				const tx: ContractTransaction = await reBakedDAO.connect(initiator).createProject(iouToken.address, budget);
				const receipt: ContractReceipt = await tx.wait();

				const args: Result = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
				const projectId = args[0];
				const project = await reBakedDAO.getProjectData(projectId);
				const timestamp: number = await getTimestamp();

				expect(projectId).to.equal(solidityKeccak256(["address", "uint256", "uint256"], [initiator.address, (await getBlock(tx.blockHash!)).parentHash, 0]));
				expect(project.initiator).to.equal(initiator.address);
				expect(project.token).to.equal(iouToken.address);
				expect(project.isOwnToken).to.be.true;
				expect(project.budget).to.equal(budget);
				expect(project.timeCreated).to.closeTo(timestamp, 10);
				expect(project.timeApproved).to.closeTo(timestamp, 10);
				expect(project.timeStarted).to.closeTo(timestamp, 10);
			});

			it("[OK]: Token balance has been changed after creating project", async () => {
				await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
				await expect(reBakedDAO.connect(initiator).createProject(iouToken.address, 100)).changeTokenBalances(iouToken, [initiator, reBakedDAO], [-100, 100]);
			});
		});

		describe("Create new project without existed token succesfully", async () => {
			const tx: ContractTransaction = await reBakedDAO.connect(initiator).createProject(ZERO_ADDRESS, 100);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			const [projectId] = args;
			const project = await reBakedDAO.getProjectData(projectId);
			const timestamp: number = await getTimestamp();

			expect(projectId).to.equal(solidityKeccak256(["address", "uint256", "uint256"], [initiator.address, (await getBlock(tx.blockHash!)).parentHash, 0]));
			expect(project.initiator).to.equal(initiator.address);
			expect(project.token).to.equal(ZERO_ADDRESS);
			expect(project.isOwnToken).to.be.false;
			expect(project.budget).to.equal(100);
			expect(project.timeCreated).to.closeTo(timestamp, 10);
			expect(project.timeApproved).to.equal(0);
			expect(project.timeStarted).to.equal(0);
		});
	});

	describe("Testing `approveProject` function", () => {
		beforeEach(async () => {
			tx = await reBakedDAO.connect(initiator).createProject(ZERO_ADDRESS, TOKEN_100);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];
		});

		it("[Fail]: Caller is not the owner", async () => {
			await expect(reBakedDAO.connect(initiator).approveProject(projectId)).to.revertedWith("Ownable: caller is not the owner");
		});

		it("[Fail]: Approve a project that is not existed", async () => {
			await expect(reBakedDAO.connect(deployer).approveProject(formatBytes32String("test"))).to.revertedWith("no such project");
		});

		it("[Fail]: Approve a project that is approved before", async () => {
			await reBakedDAO.connect(deployer).approveProject(projectId);
			await expect(reBakedDAO.connect(deployer).approveProject(projectId)).to.revertedWith("already approved project");
		});

		it("[OK]: Approve a project successfully", async () => {
			await expect(reBakedDAO.connect(deployer).approveProject(projectId)).to.emit(reBakedDAO, "ApprovedProject").withArgs(projectId);

			const project = await reBakedDAO.getProjectData(projectId);
			const timestamp = await getTimestamp();
			expect(project.timeApproved).to.closeTo(timestamp, 10);
		});
	});

	describe("Testing `startProject` function", () => {
		beforeEach(async () => {
			tx = await reBakedDAO.connect(initiator).createProject(ZERO_ADDRESS, TOKEN_100);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];
		});

		it("[Fail]: Caller is not the initiator of the project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).startProject(projectId)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Project has not been approved", async () => {
			await expect(reBakedDAO.connect(initiator).startProject(projectId)).to.revertedWith("project is not approved");
		});

		it("[Fail]: Project has been started", async () => {
			await reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId);
			await expect(reBakedDAO.connect(initiator).startProject(projectId)).to.revertedWith("project already started");
		});

		it("[OK]: Start project successfully", async () => {
			let project = await reBakedDAO.getProjectData(projectId);
			await reBakedDAO.connect(deployer).approveProject(projectId);
			await expect(reBakedDAO.connect(initiator).startProject(projectId)).to.emit(reBakedDAO, "StartedProject").withArgs(projectId, TOKEN_100);
			const timestamp: number = await getTimestamp();

			project = await reBakedDAO.getProjectData(projectId);
			expect(project.token).not.equal(ZERO_ADDRESS);
			expect(project.timeStarted).to.closeTo(timestamp, 10);
		});
	});

	describe("Testing `createPackage` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(ZERO_ADDRESS, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];
		});

		it("[Fail]: Caller is not initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).createPackage(projectId, TOKEN_100, 10, 40, 5)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Create new package with budget equal to 0", async () => {
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, 0, 10, 40, 5)).to.revertedWith("Zero amount");
		});

		it("[Fail]: Project has not been started", async () => {
			await reBakedDAO.connect(deployer).approveProject(projectId);
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5)).to.revertedWith("project is not started");
		});

		it("[Fail]: Project has been finished", async () => {
			await reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId);
			await reBakedDAO.connect(initiator).finishProject(projectId);
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5)).to.revertedWith("project is finished");
		});

		it("[Fail]: Project budget left is not enough", async () => {
			reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId);
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("990", 18), TOKEN_10, TOKEN_40, 5)).to.revertedWith("not enough project budget left");
		});

		it("[Fail]: Incorrect max collaborators (require 3 <= maxCollaborators <= 19)", async () => {
			reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId);
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 2)).to.revertedWith("incorrect max colalborators");
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 11)).to.revertedWith("incorrect max colalborators");
		});

		it("[OK]: Create new package successfully", async () => {
			reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId);
			tx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 3);
			receipt = await tx.wait();
			const packageId: string = receipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];
			const createdPackage = await reBakedDAO.getPackageData(projectId, packageId);
			const timestamp = await getTimestamp();

			expect(packageId).to.equal(solidityKeccak256(["address", "uint256", "uint256"], [initiator.address, (await getBlock(tx.blockHash!)).parentHash, 0]));
			expect(createdPackage.budget).to.equal(TOKEN_100);
			expect(createdPackage.budgetObservers).to.equal(TOKEN_40);
			expect(createdPackage.bonus).to.equal(TOKEN_10);
			expect(createdPackage.timeCreated).to.closeTo(timestamp, 10);
			expect(createdPackage.isActive).to.be.true;

			const currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetAllocated).to.equal(parseUnits("150", 18));
			expect(currentProject.totalPackages).to.equal(1);
		});
	});

	describe("Testing `addCollaborator` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 3);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];
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
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [], []);
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10)).to.revertedWith("no such package");
		});

		it("[Fail]: Package has been finished", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10)).to.revertedWith("no such package");
		});

		it("[Fail]: Package budget is not enough to pay mgp", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, parseUnits("101", 18))).to.revertedWith("not enough package budget left");
		});

		it("[Fail]: Exceed max collaborators", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, accounts[15].address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, accounts[16].address, TOKEN_10);
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, accounts[17].address, TOKEN_10)).to.revertedWith("Max collaborators reached");
		});

		it("[OK]: Add collaborator successfully", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10)).to.emit(reBakedDAO, "AddedCollaborator").withArgs(projectId, packageId1, collaborator1.address, TOKEN_10);
			const addedCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(addedCollaborator.mgp).to.equal(TOKEN_10);
			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.budgetAllocated).to.equal(TOKEN_10);
			expect(currentPackage.totalCollaborators).to.equal(1);

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
			await reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator2.address, true);

			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_20)).to.emit(reBakedDAO, "AddedCollaborator").withArgs(projectId, packageId1, collaborator2.address, TOKEN_20);
			const addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			expect(addedCollaborator2.mgp).to.equal(TOKEN_20);
			currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.budgetAllocated).to.equal(TOKEN_40);
			expect(currentPackage.totalCollaborators).to.equal(3);
		});
	});

	describe("Testing `approveCollaborator` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).approveCollaborator(projectId, packageId1, collaborator1.address)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Collaborator has not been added", async () => {
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address)).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Package is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address], []);
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address)).to.revertedWith("no such package");
		});

		it("[Fail]: Collaborator has been approved", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address)).to.revertedWith("collaborator already approved");
		});

		it("[OK]: Approve collaborator successfully", async () => {
			// Collaborator 1
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address)).to.emit(reBakedDAO, "ApprovedCollaborator").withArgs(projectId, packageId1, collaborator1.address);
			const timestamp = await getTimestamp();

			const currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(currentCollaborator.timeMgpApproved).to.closeTo(timestamp, 10);

			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.approvedCollaborators).to.equal(1);

			// Collaborator 2
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address)).to.emit(reBakedDAO, "ApprovedCollaborator").withArgs(projectId, packageId1, collaborator2.address);

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
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
		});

		it("[Fail]: Caller is not project initiator", async () => {
			await expect(reBakedDAO.connect(accounts[1]).removeCollaborator(projectId, packageId1, collaborator1.address, true)).to.revertedWith("caller is not project initiator");
			await expect(reBakedDAO.connect(collaborator2).removeCollaborator(projectId, packageId1, collaborator1.address, true)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Remove collaborator but he/she has been approved", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address,);
			await expect(reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator1.address, true)).to.revertedWith("collaborator approved already!");
		});

		it("[Fail]: Remove collaborator but collaborator is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, accounts[15].address, true)).to.revertedWith("no such collaborator");
			await expect(reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, accounts[15].address, false)).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Remove collaborator but collaborator has been claim mgp", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], []);
			await expect(reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator1.address, false)).to.revertedWith("Already Claimed MGP");
		});

		it("[Fail]: Remove collaborator but he/she is being in dispute", async () => {
			await reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator1.address, false);
			await expect(reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator1.address, false)).to.revertedWith("already in dispute");
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
                .to.emit(reBakedDAO, "RequestedRemoval")
                .withArgs(projectId, packageId1, collaborator2.address);

			const currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			const timestamp = await getTimestamp();
			expect(currentCollaborator2.disputeExpiresAt).to.closeTo(timestamp + TWO_DAYS, 10);

			currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.disputesCount).to.equal(1);
		});
	});

	describe("Testing `defendRemoval` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);

			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address);

			await reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator1.address, false);
		});

		it("[Fail]: Collaborator defends removal but collaborator is not existed", async () => {
			await expect(reBakedDAO.connect(accounts[0]).defendRemoval(projectId, packageId1)).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Collaborator defends removal but dispute period has been already expired", async () => {
			await skipTime(THREE_DAYS + 1);
			await expect(reBakedDAO.connect(collaborator1).defendRemoval(projectId, packageId1)).to.revertedWith("dispute period already expired");
		});

        it("[Fail]: Collaborator has been defended removal", async () => {
            await reBakedDAO.connect(collaborator1).defendRemoval(projectId, packageId1);

			await skipTime(ONE_DAY + 1);
			await expect(reBakedDAO.connect(collaborator1).defendRemoval(projectId, packageId1))
                .to.revertedWith("already defended removal");
        })

		it("[OK]: Collaborator defends removal successfully", async () => {
			await skipTime(ONE_DAY + 1);
			await reBakedDAO.connect(collaborator1).defendRemoval(projectId, packageId1);
			const timestamp = await getTimestamp();

			const currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(currentCollaborator.resolveExpiresAt.sub(THREE_DAYS)).to.closeTo(timestamp, 10);
		});
	});

	describe("Tesing `settleExpiredDispute` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);

			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address);

			await reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator1.address, false);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[10]).settleExpiredDispute(projectId, packageId1, collaborator1.address)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Initiator settles dispute but collaborator is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).settleExpiredDispute(projectId, packageId1, accounts[10].address)).to.revertedWith("not elligible to remove yet");

			await reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator2.address, true);
			await expect(reBakedDAO.connect(initiator).settleExpiredDispute(projectId, packageId1, collaborator2.address)).to.revertedWith("not elligible to remove yet");
		});

		describe("Initiator has not not been elligible to remove yet", () => {
			it("[Fail]: Collaborator is not in dispute", async () => {
				await expect(reBakedDAO.connect(initiator).settleExpiredDispute(projectId, packageId1, collaborator2.address)).to.revertedWith("not elligible to remove yet");
			});

			it("[Fail]: Dispute period has not been expired", async () => {
				await expect(reBakedDAO.connect(initiator).settleExpiredDispute(projectId, packageId1, collaborator1.address)).to.revertedWith("not elligible to remove yet");
			});

			it("[Fail]: Appealed period has not been expired", async () => {
				await skipTime(ONE_DAY + 1);
				await reBakedDAO.connect(collaborator1).defendRemoval(projectId, packageId1);
				await skipTime(TWO_DAYS);
				await expect(reBakedDAO.connect(initiator).settleExpiredDispute(projectId, packageId1, collaborator1.address)).to.revertedWith("not elligible to remove yet");
			});
		});

		it("[OK]: Initiator settles dispute successfully", async () => {
			await skipTime(TWO_DAYS + 1);
			await expect(reBakedDAO.connect(initiator).settleExpiredDispute(projectId, packageId1, collaborator1.address))
                .to.emit(reBakedDAO, "RemovedCollaborator")
                .withArgs(projectId, packageId1, collaborator1.address);

			const currentCollaborator1 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(currentCollaborator1.disputeExpiresAt).to.equal(0);
			expect(currentCollaborator1.resolveExpiresAt).to.equal(0);
			expect(currentCollaborator1.isRemoved).to.be.true;
			expect(currentCollaborator1.mgp).to.equal(TOKEN_10);

			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.disputesCount).to.equal(0);

			await reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator2.address, false);
			await skipTime(ONE_DAY + 1);
			await reBakedDAO.connect(collaborator2).defendRemoval(projectId, packageId1);
			await skipTime(THREE_DAYS + 1);
			await expect(reBakedDAO.connect(initiator).settleExpiredDispute(projectId, packageId1, collaborator2.address))
                .to.emit(reBakedDAO, "RemovedCollaborator")
                .withArgs(projectId, packageId1, collaborator2.address);

			const currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			expect(currentCollaborator2.disputeExpiresAt).to.equal(0);
			expect(currentCollaborator2.resolveExpiresAt).to.equal(0);
			expect(currentCollaborator2.isRemoved).to.be.true;
			expect(currentCollaborator2.mgp).to.equal(TOKEN_10);

			currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.disputesCount).to.equal(0);
		});
	});

	describe("Testing `resolveDispute` function", async () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);

			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address);

			await reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator1.address, false);
		});

		it("[Fail]: Caller is not authorized", async () => {
			await expect(reBakedDAO.connect(initiator).resolveDispute(projectId, packageId1, collaborator1.address, true)).to.revertedWith("Caller is not authorized");

			await expect(reBakedDAO.connect(observer2).resolveDispute(projectId, packageId1, collaborator1.address, true)).to.revertedWith("Caller is not authorized");

			await reBakedDAO.connect(initiator).removeObserver(projectId, [packageId1], observer1.address);
			await expect(reBakedDAO.connect(observer1).resolveDispute(projectId, packageId1, collaborator1.address, true)).to.revertedWith("Caller is not authorized");
		});

		it("[Fail]: Resolve dispute but resolve period already expired", async () => {
			await expect(reBakedDAO.connect(deployer).resolveDispute(projectId, packageId1, collaborator1.address, true)).to.revertedWith("resolve period already expired");
			await expect(reBakedDAO.connect(observer1).resolveDispute(projectId, packageId1, collaborator1.address, true)).to.revertedWith("resolve period already expired");

			await skipTime(ONE_DAY + 1);
			await reBakedDAO.connect(collaborator1).defendRemoval(projectId, packageId1);
			await skipTime(THREE_DAYS + 1);

			await expect(reBakedDAO.connect(deployer).resolveDispute(projectId, packageId1, collaborator1.address, true)).to.revertedWith("resolve period already expired");
			await expect(reBakedDAO.connect(observer1).resolveDispute(projectId, packageId1, collaborator1.address, true)).to.revertedWith("resolve period already expired");
		});

		it("[OK]: Resolve dispute successfully", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
			await reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator2.address, false);

			await reBakedDAO.connect(collaborator1).defendRemoval(projectId, packageId1);
			await expect(reBakedDAO.connect(deployer).resolveDispute(projectId, packageId1, collaborator1.address, true))
                .to.changeTokenBalance(iouToken, collaborator1.address, TOKEN_10)
                .to.emit(reBakedDAO, "RemovedCollaborator")
                .withArgs(projectId, packageId1, collaborator1.address);

			const currentCollaborator1 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(currentCollaborator1.disputeExpiresAt).to.equal(0);
			expect(currentCollaborator1.resolveExpiresAt).to.equal(0);
			expect(currentCollaborator1.isRemoved).to.be.true;
			expect(currentCollaborator1.mgp).to.equal(TOKEN_10);
			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.disputesCount).to.equal(1);

			await reBakedDAO.connect(collaborator2).defendRemoval(projectId, packageId1);
			await reBakedDAO.connect(deployer).resolveDispute(projectId, packageId1, collaborator2.address, false);
			const currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			expect(currentCollaborator2.disputeExpiresAt).to.equal(0);
			expect(currentCollaborator2.resolveExpiresAt).to.equal(0);
			expect(currentCollaborator2.isRemoved).to.be.true;
			expect(currentCollaborator2.mgp).to.equal(TOKEN_10);

			currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.disputesCount).to.equal(0);
		});
	});

	describe("Testing `selfRemove` function", async () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
		});

		it("[Fail]: Collaborator is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).selfRemove(projectId, packageId1)).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Collaborator has been approved", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(collaborator1).selfRemove(projectId, packageId1)).to.revertedWith("collaborator approved already!");
		})

		it("[Fail]: Collaborator self remove from package but package is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address], []);
			await expect(reBakedDAO.connect(collaborator1).selfRemove(projectId, packageId1)).to.revertedWith("no such package");
		});

		it("[OK]: Collaborator self remove from package successfully", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_20);

			// Collaborator 1
			await reBakedDAO.connect(collaborator1).selfRemove(projectId, packageId1);
			const currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(currentCollaborator.mgp).to.equal(TOKEN_10);
			expect(currentCollaborator.isRemoved).to.be.true;
			expect(currentCollaborator.bonusScore).to.equal(0);
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
			expect(currentCollaborator2.bonusScore).to.equal(0);
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
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_10, 0, 0, 5);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId2, collaborator1.address, TOKEN_10);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).finishPackage(projectId, packageId1)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Finish package but package is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, formatBytes32String("test"))).to.revertedWith("no such package");
		});

		it("[Fail]: Finish package but package is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address], []);
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1)).to.revertedWith("no such package");
		});

		it("[Fail]: Finish package but package has been finished", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1)).to.revertedWith("no such package");
		});

		it("[Fail]: Finish package but package still has unresolved disputes", async () => {
			await reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId1, collaborator1.address, false);
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1)).to.revertedWith("package has unresolved disputes");
		});

		it("[Fail]: Finish package but package still has unapproved collaborators left", async () => {
			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1)).to.revertedWith("unapproved collaborators left");
		});

		it("[OK]: Finish package successfully", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);

			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId1)).to.emit(reBakedDAO, "FinishedPackage").withArgs(projectId, packageId1, parseUnits("120", 18));

			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			let timestamp = await getTimestamp();
			expect(currentPackage.timeFinished).to.closeTo(timestamp, 10);

			let currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetAllocated).to.equal(TOKEN_40);
			expect(currentProject.totalFinishedPackages).to.equal(1);

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId2, collaborator1.address);

			await expect(reBakedDAO.connect(initiator).finishPackage(projectId, packageId2)).to.emit(reBakedDAO, "FinishedPackage").withArgs(projectId, packageId2, 0);
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
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).cancelPackage(projectId, packageId1, [], [])).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Cancel package but package is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, formatBytes32String("test"), [], [])).to.revertedWith("no such package");
		});

		it("[Fail]: Cancel package but package is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], []);
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [])).to.revertedWith("no such package");
		});

		it("[Fail]: Cancel package but package has been finished", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [])).to.revertedWith("no such package");
		});

		it("[Fail]: Cancel package but with invalid collaborators length", async () => {
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator2.address], [])).to.revertedWith("invalid collaborators length");
		});

		it("[Fail]: Cancel package but with invalid observers length", async () => {
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address);
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [])).to.revertedWith("invalid observers length");
		});

		it("[Fail]: Cancel package but collaborator is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [accounts[9].address, collaborator2.address], [])).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Cancel package but observer is not existed", async () => {
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address);
			await expect(reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [accounts[9].address])).to.revertedWith("no such observer");
		});

		it("[OK]: Cancel package successfully", async () => {
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address);
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], [observer1.address]);

			const currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			const timestamp = await getTimestamp();
			expect(currentPackage.timeCanceled).to.closeTo(timestamp, 10);
			expect(currentPackage.isActive).to.be.false;

			const currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.totalPackages).to.equal(0);
			expect(currentProject.budgetAllocated).to.equal(parseUnits("70", 18));
		});
	});

	describe("Testing `finishProject` function", () => {
		beforeEach(async () => {
			tx = await reBakedDAO.connect(initiator).createProject(ZERO_ADDRESS, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).finishProject(projectId)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Finish project but project has not been started", async () => {
			await expect(reBakedDAO.connect(initiator).finishProject(projectId)).to.revertedWith("project not started yet");
		});

		it("[Fail]: Finish project but project has been finished before", async () => {
			await reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId);
			await reBakedDAO.connect(initiator).finishProject(projectId);
			await expect(reBakedDAO.connect(initiator).finishProject(projectId)).to.revertedWith("already finished project");
		});

		it("[Fail]: Finish project but project still has unfinished packages left", async () => {
			await reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId);

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);

			await expect(reBakedDAO.connect(initiator).finishProject(projectId)).to.revertedWith("unfinished packages left");
		});

		it("[OK]: Finish project that does not have own token successfully", async () => {
			await reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId);

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);

			await expect(reBakedDAO.connect(initiator).finishProject(projectId)).to.emit(reBakedDAO, "FinishedProject").withArgs(projectId);
			const timestamp = await getTimestamp();
			const currentProject = await reBakedDAO.getProjectData(projectId);

			expect(currentProject.timeFinished).to.closeTo(timestamp, 10);
		});

		it("[OK]: Finish project that has own token successfully", async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			const tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			const receipt = await tx.wait();
			const args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			const projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			const packageId = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator2.address, TOKEN_10);

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator2.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId);

			const refundAmount = parseUnits("970", 18).mul(5).div(100);
			const budgetLeft = parseUnits("970", 18).mul(95).div(100);
			await expect(reBakedDAO.connect(initiator).finishProject(projectId)).to.emit(reBakedDAO, "FinishedProject").withArgs(projectId).to.changeTokenBalances(iouToken, [initiator, treasury], [refundAmount, budgetLeft]);

			const currentProject = await reBakedDAO.getProjectData(projectId);
			const timestamp = await getTimestamp();
			expect(currentProject.timeFinished).to.closeTo(timestamp, 10);
		});

		it("[OK]: Finish project with zero budget left", async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			const tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			const receipt = await tx.wait();
			const args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			const projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_1000, 0, 0, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			const packageId = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator1.address, TOKEN_1000);

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator1.address);

			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId);
			await reBakedDAO.connect(initiator).finishProject(projectId);

			const currentProject = await reBakedDAO.getProjectData(projectId);
			const timestamp = await getTimestamp();
			expect(currentProject.timeFinished).to.closeTo(timestamp, 10);
		})
	});

	describe("Testing `payMgp` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).payMgp(projectId, packageId1, collaborator1.address)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Collaborator is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).payMgp(projectId, packageId1, accounts[9].address)).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Collaborator has been paid mgp", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await reBakedDAO.connect(initiator).payMgp(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(initiator).payMgp(projectId, packageId1, collaborator1.address)).to.revertedWith("mgp already paid");
		});

		it("[OK]: PayMgp successfully", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);

			let currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(initiator).payMgp(projectId, packageId1, collaborator1.address)).to.emit(reBakedDAO, "PaidMgp").withArgs(projectId, packageId1, collaborator1.address, currentCollaborator.mgp);

			currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			let timestamp = await getTimestamp();
			expect(currentCollaborator.timeMgpPaid).to.closeTo(timestamp, 10);

			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.budgetPaid).to.equal(currentCollaborator.mgp);

			let currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetPaid).to.equal(currentCollaborator.mgp);

			let currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			await expect(reBakedDAO.connect(initiator).payMgp(projectId, packageId1, collaborator2.address)).to.emit(reBakedDAO, "PaidMgp").withArgs(projectId, packageId1, collaborator2.address, currentCollaborator2.mgp);

			currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			timestamp = await getTimestamp();
			expect(currentCollaborator2.timeMgpPaid).to.closeTo(timestamp, 10);

			currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.budgetPaid).to.equal(currentCollaborator.mgp.add(currentCollaborator2.mgp));

			currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetPaid).to.equal(currentCollaborator.mgp.add(currentCollaborator2.mgp));
		});
	});

	describe("Testing `claimMgp` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
		});

		it("[Fail]: Caller is not collaborator", async () => {
			await expect(reBakedDAO.connect(initiator).claimMgp(projectId, packageId1)).to.revertedWith("no such collaborator");
		});

        it("[Fail]: Claim mgp but collaborator has not been approved", async () => {
			await expect(reBakedDAO.connect(collaborator1).claimMgp(projectId, packageId1)).to.revertedWith("mgp is not approved");
        })

		it("[Fail]: Claim mgp but collaborator has been paid mgp", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);

			await reBakedDAO.connect(initiator).payMgp(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(collaborator1).claimMgp(projectId, packageId1)).to.revertedWith("mgp already paid");

			await reBakedDAO.connect(collaborator2).claimMgp(projectId, packageId1);
			await expect(reBakedDAO.connect(collaborator2).claimMgp(projectId, packageId1)).to.revertedWith("mgp already paid");
		});

		it("[Fail]: Claim mgp but package has not been finished", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(collaborator1).claimMgp(projectId, packageId1)).to.revertedWith("package not finished/canceled");
		});

		it("[OK]: Collaborator claims mgp successfully", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);

			let currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await expect(reBakedDAO.connect(collaborator1).claimMgp(projectId, packageId1)).to.emit(reBakedDAO, "PaidMgp").withArgs(projectId, packageId1, collaborator1.address, currentCollaborator.mgp);
			currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			let timestamp = await getTimestamp();
			expect(currentCollaborator.timeMgpPaid).to.closeTo(timestamp, 10);

			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.budgetPaid).to.equal(currentCollaborator.mgp);

			let currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetPaid).to.equal(currentCollaborator.mgp);

			let currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			await expect(reBakedDAO.connect(collaborator2).claimMgp(projectId, packageId1)).to.emit(reBakedDAO, "PaidMgp").withArgs(projectId, packageId1, collaborator2.address, currentCollaborator2.mgp);
			currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			timestamp = await getTimestamp();
			expect(currentCollaborator2.timeMgpPaid).to.closeTo(timestamp, 10);

			currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.budgetPaid).to.equal(currentCollaborator.mgp.add(currentCollaborator2.mgp));

			currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetPaid).to.equal(currentCollaborator.mgp.add(currentCollaborator2.mgp));
		});
	});

	describe("Testing `setBonusScores` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);
		});

		it("[Fail]: Caller is not the owner", async () => {
			await expect(reBakedDAO.connect(initiator).setBonusScores(projectId, packageId1, [collaborator1.address], [10])).to.revertedWith("Ownable: caller is not the owner");
		});

		it("[Fail]: Array length of collaboratos and scores are not match", async () => {
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address], [9, 10])).to.revertedWith("arrays length mismatch");
		});

		it("[Fail]: Invalid collaborator list", async () => {
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address, collaborator2.address, accounts[15].address], [9, 10, 11])).to.revertedWith("invalid collaborators list");
		});

		it("[Fail]: Set bonus scores for collaborator that is not added to package", async () => {
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [accounts[15].address], [1e6])).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Collaborator has been setBonusScores", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address, collaborator2.address], [2 * 1e5, 8 * 1e5]);
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address], [1e6])).to.revertedWith("collaborator bonus already set");
		});

		it("[Fail]: Set bonus scores for collaborator but bonus score is zeros", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address, collaborator2.address], [1e6, 0]))
				.to.revertedWith("new bonus score is zero");
		})

		it("[Fail]: Total bonus score is not correct (not equal 1e6)", async () => {
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address], [10])).to.revertedWith("incorrect total bonus scores");
		});

		it("[Fail]: Bonus of package is zero", async () => {
			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, 0, TOKEN_40, 5);
			const packageReceipt: ContractReceipt = await packageTx.wait();
			const packageId = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator1.address, TOKEN_10);
			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator1.address);

			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId, [collaborator1.address], [1e6])).to.revertedWith("zero bonus budget");
		});

		it("[Fail]: Set bonus scores but package is not finished", async () => {
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address], [1e6])).to.revertedWith("package is not finished");
	
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address, collaborator2.address], []);
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address], [1e6])).to.revertedWith("package is not finished");
		});

		it("[OK]: Set bonus scores successfully", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address, collaborator2.address], [3 * 1e5, 7 * 1e5]);

			const currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			const currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			const currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);

			expect(currentCollaborator.bonusScore).to.equal(3 * 1e5);
			expect(currentCollaborator2.bonusScore).to.equal(7 * 1e5);
			expect(currentPackage.collaboratorsGetBonus).to.equal(2);
		});
	});

	describe("Testing `claimBonus` function", async () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, 0, TOKEN_40, 5);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_10);
		});

		it("[Fail]: Caller is not the collaborator of package", async () => {
			await expect(reBakedDAO.connect(initiator).claimBonus(projectId, packageId1)).to.revertedWith("no such collaborator");
		});

		it("[Fail]: Claim bonus but bonus score is zero", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);

			await expect(reBakedDAO.connect(collaborator1).claimBonus(projectId, packageId1)).to.revertedWith("bonus score is zero");
		});

		it("[Fail]: Claim bonus but collaborator has been claimed before", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);

			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address, collaborator2.address], [3 * 1e5, 7 * 1e5]);
			await reBakedDAO.connect(collaborator1).claimBonus(projectId, packageId1);
			await expect(reBakedDAO.connect(collaborator1).claimBonus(projectId, packageId1)).to.revertedWith("bonus already paid");
		});

		it("[OK]: Claim bonus successfully", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);

			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address, collaborator2.address], [3e5, 7e5]);
			const test = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			await expect(reBakedDAO.connect(collaborator1).claimBonus(projectId, packageId1)).to.emit(reBakedDAO, "PaidBonus");
            
			const currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			let timestamp = await getTimestamp();
			expect(currentCollaborator.timeBonusPaid).to.closeTo(timestamp, 10);

			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.bonusPaid).to.equal(parseUnits("3", 18));
			expect(currentPackage.collaboratorsPaidBonus).to.equal(1);

			await expect(reBakedDAO.connect(collaborator2).claimBonus(projectId, packageId1)).to.emit(reBakedDAO, "PaidBonus");
			const currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator2.address);
			timestamp = await getTimestamp();
			expect(currentCollaborator2.timeBonusPaid).to.closeTo(timestamp, 10);

			currentPackage = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage.bonusPaid).to.equal(TOKEN_10);
			expect(currentPackage.collaboratorsPaidBonus).to.equal(2);
		});
	});

	describe("Testing `addObserver` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).addObserver(projectId, [packageId1], observer1.address)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Add observer with zero address", async () => {
			await expect(reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], ZERO_ADDRESS)).to.revertedWith("observer's address is zero");
		});

		it("[Fail]: Observer has been added", async () => {
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], observer1.address);
			await expect(reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address)).to.revertedWith("observer already added");
		});

		it("[Fail]: Add observer to a package that is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).addObserver(projectId, [formatBytes32String("test")], observer1.address)).to.revertedWith("no such package");
		});

		it("[Fail]: Add observer to a package that is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address], []);
			await expect(reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address)).to.revertedWith("no such package");
		});

		it("[Fail]: Add observer to a package that has been finished", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await expect(reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address)).to.revertedWith("no such package");
		});

		it("[Fail]: Add observer exceeding max observer", async () => {
			for (let i = 4; i < 14; i++) {
				await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], accounts[i].address);
			}
			await expect(reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], accounts[15].address)).to.revertedWith("Max observers reached");
		});

		it("[OK]: Add observer successfully", async () => {
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], observer1.address);

			let timestamp = await getTimestamp();
			const addedObserver11 = await reBakedDAO.getObserverData(projectId, packageId1, observer1.address);
			let package1 = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(addedObserver11.timeCreated).to.closeTo(timestamp, 10);
			expect(package1.totalObservers).to.equal(1);

			const addedObserver12 = await reBakedDAO.getObserverData(projectId, packageId2, observer1.address);
			let package2 = await reBakedDAO.getPackageData(projectId, packageId2);
			expect(addedObserver12.timeCreated).to.closeTo(timestamp, 10);
			expect(package2.totalObservers).to.equal(1);

			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], observer2.address);

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

	describe("Testing `removeObserver` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);

			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], observer1.address);
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer2.address);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).removeObserver(projectId, [packageId1], observer1.address)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Remove observer from a package that is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [collaborator1.address], [observer1.address, observer2.address]);
			await expect(reBakedDAO.connect(initiator).removeObserver(projectId, [packageId1], observer1.address)).to.revertedWith("no such package");
		});

		it("[Fail]: Remove observer from a package that has been finished", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await expect(reBakedDAO.connect(initiator).removeObserver(projectId, [packageId1], observer1.address)).to.revertedWith("no such package");
		});

		it("[Fail]: Remove invalid observer", async () => {
			await expect(reBakedDAO.connect(initiator).removeObserver(projectId, [packageId1, packageId2], observer2.address)).to.revertedWith("no such observer");
		});

		it("[OK]: Remove observer successfully", async () => {
			await reBakedDAO.connect(initiator).removeObserver(projectId, [packageId1, packageId2], observer1.address);
			let package1 = await reBakedDAO.getPackageData(projectId, packageId1);
			let package2 = await reBakedDAO.getPackageData(projectId, packageId2);
			expect(package1.totalObservers).to.equal(1);
			expect(package2.totalObservers).to.equal(0);

			await reBakedDAO.connect(initiator).removeObserver(projectId, [packageId1], observer2.address);
			package1 = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(package1.totalObservers).to.equal(0);
		});
	});

	describe("Testing `payObserverFee`", async () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_30, 5);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);

			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).payObserverFee(projectId, packageId1, observer1.address)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Observer is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).payObserverFee(projectId, packageId1, accounts[9].address)).to.revertedWith("no such observer");
		});

		it("[Fail]: Observer has been paid fee before", async () => {
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], observer1.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await reBakedDAO.connect(initiator).payObserverFee(projectId, packageId1, observer1.address);
			await expect(reBakedDAO.connect(initiator).payObserverFee(projectId, packageId1, observer1.address)).to.revertedWith("observer already paid");
		});

		it("[Fail]: Pay observer fee but package has not been finished/canceled", async () => {
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], observer1.address);
			await expect(reBakedDAO.connect(initiator).payObserverFee(projectId, packageId1, observer1.address)).to.revertedWith("package is not finished/canceled");
		});

		it("[OK]: Pay observer fee successfully", async () => {
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], observer1.address);
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer2.address);

			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId2);

			// Observer 1 - Package 1
			await expect(reBakedDAO.connect(initiator).payObserverFee(projectId, packageId1, observer1.address))
				.to.emit(reBakedDAO, "PaidObserverFee")
				.withArgs(projectId, packageId1, observer1.address, TOKEN_20)
				.to.changeTokenBalances(iouToken, [observer1.address], [TOKEN_20]);

			let timestamp = await getTimestamp();
			const currentObserver11 = await reBakedDAO.getObserverData(projectId, packageId1, observer1.address);
			expect(currentObserver11.timePaid).to.closeTo(timestamp, 10);

			let currentPackage1 = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage1.budgetObserversPaid).to.equal(TOKEN_20);

			let currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetPaid).to.equal(TOKEN_20);

			// Observer 1 - Package 2
			await expect(reBakedDAO.connect(initiator).payObserverFee(projectId, packageId2, observer1.address))
				.to.emit(reBakedDAO, "PaidObserverFee")
				.withArgs(projectId, packageId2, observer1.address, TOKEN_30)
				.to.changeTokenBalances(iouToken, [observer1.address], [TOKEN_30]);

			timestamp = await getTimestamp();
			const currentObserver12 = await reBakedDAO.getObserverData(projectId, packageId2, observer1.address);
			expect(currentObserver12.timePaid).to.closeTo(timestamp, 10);

			const currentPackage2 = await reBakedDAO.getPackageData(projectId, packageId2);
			expect(currentPackage2.budgetObserversPaid).to.equal(TOKEN_30);

			currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetPaid).to.equal(TOKEN_50);

			// Observer 2 - Package 1
			await expect(reBakedDAO.connect(initiator).payObserverFee(projectId, packageId1, observer2.address))
				.to.emit(reBakedDAO, "PaidObserverFee")
				.withArgs(projectId, packageId1, observer2.address, TOKEN_20)
				.to.changeTokenBalances(iouToken, [observer2.address], [TOKEN_20]);

			timestamp = await getTimestamp();
			const currentObserver21 = await reBakedDAO.getObserverData(projectId, packageId1, observer2.address);
			expect(currentObserver21.timePaid).to.closeTo(timestamp, 10);

			currentPackage1 = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage1.budgetObserversPaid).to.equal(TOKEN_40);

			currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetPaid).to.equal(parseUnits("70", 18));
		});
	});

	describe("Testing `claimObserverFee` function", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_30, 5);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_10);

			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], observer1.address);
		});

		it("[Fail]: Caller is not the observer of package", async () => {
			await expect(reBakedDAO.connect(accounts[1]).claimObserverFee(projectId, packageId1)).to.revertedWith("no such observer");
		});

		it("[Fail]: Observer has been claimed fee before", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await reBakedDAO.connect(observer1).claimObserverFee(projectId, packageId1);
			await expect(reBakedDAO.connect(observer1).claimObserverFee(projectId, packageId1)).to.revertedWith("observer already paid");
		});

		it("[Fail]: Observer claims fee but package has not been finished", async () => {
			await expect(reBakedDAO.connect(observer1).claimObserverFee(projectId, packageId1)).to.revertedWith("package is not finished/canceled");
		});

		it("[OK]: Observer claims successfully", async () => {
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer2.address);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId2);

			// Observer 1 - Package 1
			await expect(reBakedDAO.connect(observer1).claimObserverFee(projectId, packageId1))
				.to.emit(reBakedDAO, "PaidObserverFee")
				.withArgs(projectId, packageId1, observer1.address, TOKEN_20)
				.to.changeTokenBalances(iouToken, [observer1.address], [TOKEN_20]);

			let timestamp = await getTimestamp();
			const currentObserver11 = await reBakedDAO.getObserverData(projectId, packageId1, observer1.address);
			expect(currentObserver11.timePaid).to.closeTo(timestamp, 10);

			let currentPackage1 = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage1.budgetObserversPaid).to.equal(TOKEN_20);

			let currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetPaid).to.equal(TOKEN_20);

			// Observer 1 - Package 2
			await expect(reBakedDAO.connect(observer1).claimObserverFee(projectId, packageId2))
				.to.emit(reBakedDAO, "PaidObserverFee")
				.withArgs(projectId, packageId2, observer1.address, TOKEN_30)
				.to.changeTokenBalances(iouToken, [observer1.address], [TOKEN_30]);

			timestamp = await getTimestamp();
			const currentObserver12 = await reBakedDAO.getObserverData(projectId, packageId2, observer1.address);
			expect(currentObserver12.timePaid).to.closeTo(timestamp, 10);

			const currentPackage2 = await reBakedDAO.getPackageData(projectId, packageId2);
			expect(currentPackage2.budgetObserversPaid).to.equal(TOKEN_30);

			currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetPaid).to.equal(TOKEN_50);

			// Observer 2 - Package 1
			await expect(reBakedDAO.connect(observer2).claimObserverFee(projectId, packageId1))
				.to.emit(reBakedDAO, "PaidObserverFee")
				.withArgs(projectId, packageId1, observer2.address, TOKEN_20)
				.to.changeTokenBalances(iouToken, [observer2.address], [TOKEN_20]);

			timestamp = await getTimestamp();
			const currentObserver21 = await reBakedDAO.getObserverData(projectId, packageId1, observer2.address);
			expect(currentObserver21.timePaid).to.closeTo(timestamp, 10);

			currentPackage1 = await reBakedDAO.getPackageData(projectId, packageId1);
			expect(currentPackage1.budgetObserversPaid).to.equal(TOKEN_40);

			currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetPaid).to.equal(parseUnits("70", 18));
		});
	});

	describe("Testing get functions", () => {
		beforeEach(async () => {
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, TOKEN_1000);
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_40, 5);
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, TOKEN_100, TOKEN_10, TOKEN_30, 5);
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator1.address, TOKEN_20);
			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator1.address);

			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address);
		});

		it("Testing `getProjectData` function", async () => {
			const currentProject = await reBakedDAO.getProjectData(projectId);
			const timestamp = await getTimestamp();
			expect(currentProject.budget).equal(TOKEN_1000);
			expect(currentProject.timeCreated).to.closeTo(timestamp, 10);
			expect(currentProject.isOwnToken).to.be.true;
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
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address], [1e6]);
			const currentCollaborator = await reBakedDAO.getCollaboratorData(projectId, packageId1, collaborator1.address);
			expect(currentCollaborator.mgp).to.equal(TOKEN_20);
			expect(currentCollaborator.bonusScore).to.equal(1e6);
		});

		it("Testing `getCollaboratorRewards` function", async () => {
            await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator2.address, TOKEN_20);
			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator2.address);

			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await reBakedDAO.connect(deployer).setBonusScores(projectId, packageId1, [collaborator1.address, collaborator2.address], [3e5, 7e5]);
			let [mgp, bonus] = await reBakedDAO.getCollaboratorRewards(projectId, formatBytes32String("test"), collaborator1.address);
			expect(mgp).to.equal(0);
			expect(bonus).to.equal(0);

			[mgp, bonus] = await reBakedDAO.getCollaboratorRewards(projectId, packageId1, accounts[9].address);
			expect(mgp).to.equal(0);
			expect(bonus).to.equal(0);

			[mgp, bonus] = await reBakedDAO.getCollaboratorRewards(projectId, packageId1, collaborator1.address);
			expect(mgp).to.equal(TOKEN_20);
			expect(bonus).to.equal(parseUnits('3', 18));

            [mgp, bonus] = await reBakedDAO.getCollaboratorRewards(projectId, packageId1, collaborator2.address);
			expect(mgp).to.equal(TOKEN_20);
			expect(bonus).to.equal(parseUnits('7', 18));

			await reBakedDAO.connect(initiator).payMgp(projectId, packageId1, collaborator1.address);

			[mgp, bonus] = await reBakedDAO.getCollaboratorRewards(projectId, packageId1, collaborator1.address);
			expect(mgp).to.equal(0);
			expect(bonus).to.equal(parseUnits('3', 18));
		});

		it("Testing `getObserverData` function", async () => {
			const currentObserver = await reBakedDAO.getObserverData(projectId, packageId1, observer1.address);
			const timestamp = await getTimestamp();
			expect(currentObserver.timeCreated).to.closeTo(timestamp, 10);
		});

		describe("Testing `getObserverFee` function", async () => {
			it("[OK]: Observer has been paid fee", async () => {
				await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
				await reBakedDAO.connect(observer1).claimObserverFee(projectId, packageId1);
				const observerFee = await reBakedDAO.getObserverFee(projectId, packageId1, observer1.address);
				expect(observerFee).to.equal(0);
			});

			it("[OK]: Observer has not been added to package", async () => {
				const observerFee = await reBakedDAO.getObserverFee(projectId, packageId1, accounts[9].address);
				expect(observerFee).to.equal(0);
			});

			it("[OK]: Observer has been remove from package", async () => {
				await reBakedDAO.connect(initiator).removeObserver(projectId, [packageId1], observer1.address);
				const observerFee = await reBakedDAO.getObserverFee(projectId, packageId1, observer1.address);
				expect(observerFee).to.equal(0);
			});

			it("[OK]: Package does not have observer", async () => {
				const observerFee = await reBakedDAO.getObserverFee(projectId, packageId2, observer1.address);
				expect(observerFee).to.equal(0);
			});

			it("[OK]: Observer has claimed fee", async () => {
				await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
				await reBakedDAO.connect(observer1).claimObserverFee(projectId, packageId1);
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
