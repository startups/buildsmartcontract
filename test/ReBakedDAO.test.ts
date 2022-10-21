import { expect } from "chai";
import { ethers } from "hardhat";
import { parseUnits, formatBytes32String } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ReBakedDAO, ReBakedDAO__factory, TokenFactory, TokenFactory__factory, IOUToken, IOUToken__factory } from "../typechain-types";
import { ZERO_ADDRESS, MAX_UINT256, getTimestamp } from "./utils";
import { Result } from "@ethersproject/abi";
import { ContractReceipt, ContractTransaction } from "ethers";

describe("ReBakedDAO", () => {
	let deployer: SignerWithAddress;
	let treasury: SignerWithAddress;
	let accounts: SignerWithAddress[];
	let reBakedDAO: ReBakedDAO;
	let tokenFactory: TokenFactory;
	let iouToken: IOUToken;

	beforeEach(async () => {
		[deployer, treasury, ...accounts] = await ethers.getSigners();

		const TokenFactory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
		const IOUToken = (await ethers.getContractFactory("IOUToken")) as IOUToken__factory;
		const ReBakedDAO = (await ethers.getContractFactory("ReBakedDAO")) as ReBakedDAO__factory;

		tokenFactory = await TokenFactory.deploy();
		await tokenFactory.deployed();
		// console.log("\tTokenFactory         deployed to:", tokenFactory.address);

		iouToken = await IOUToken.deploy(accounts[0].address, "10000000000000000000000");
		await iouToken.deployed();
		// console.log("\tIOUToken         deployed to:", iouToken.address);

		reBakedDAO = await ReBakedDAO.deploy(treasury.address, 100, 50, tokenFactory.address);
		await reBakedDAO.deployed();
		// console.log("\tReBakedDAO         deployed to:", reBakedDAO.address);

		await tokenFactory.setReBakedDao(reBakedDAO.address);
	});

	describe("Validating initialized state of contracts", () => {
		it("Validating initialized state of ReBakedDAO", async function () {
			const owner = await reBakedDAO.owner();
			expect(owner).to.equal(deployer.address);

			const projectTreasury = await reBakedDAO.treasury();
			expect(projectTreasury).to.equal(treasury.address);

			await iouToken.connect(accounts[0]).approve(reBakedDAO.address, "30000000000000000000");
			expect(await tokenFactory.reBakedDao()).to.equal(reBakedDAO.address);
		});
	});

	describe("Testing `createProject` function", () => {
		describe("Create new project with existed token", () => {
			it("[Fail]: Create new project with zero budget", async () => {
				await expect(reBakedDAO.connect(accounts[0]).createProject(iouToken.address, 0)).to.revertedWith("Zero amount");
			});

			it("[Fail]: Create new project with existed token that has not been approved to transfer", async () => {
				await expect(reBakedDAO.connect(accounts[0]).createProject(iouToken.address, 3000)).to.revertedWith("ERC20: insufficient allowance");
			});

			it("[OK]: Create new project successfully", async () => {
				await iouToken.connect(accounts[0]).approve(reBakedDAO.address, MAX_UINT256);

				const budget = parseUnits("100", 18);

				const tx: ContractTransaction = await reBakedDAO.connect(accounts[0]).createProject(iouToken.address, budget);
				const receipt: ContractReceipt = await tx.wait();

				const args: Result = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
				const projectId = args[0];
				const project = await reBakedDAO.getProjectData(projectId);
				const timestamp: number = await getTimestamp();

				expect(project.initiator).to.equal(accounts[0].address);
				expect(project.token).to.equal(iouToken.address);
				expect(project.isOwnToken).to.be.true;
				expect(project.budget).to.equal(budget);
				expect(project.timeCreated).to.closeTo(timestamp, 10);
				expect(project.timeApproved).to.closeTo(timestamp, 10);
				expect(project.timeStarted).to.closeTo(timestamp, 10);
			});

			it("[OK]: Token balance has been changed after creating project", async () => {
				await iouToken.connect(accounts[0]).approve(reBakedDAO.address, MAX_UINT256);
				await expect(reBakedDAO.connect(accounts[0]).createProject(iouToken.address, 100)).changeTokenBalances(iouToken, [accounts[0], reBakedDAO], [-100, 100]);
			});
		});

		describe("Create new project without existed token succesfully", async () => {
			const tx: ContractTransaction = await reBakedDAO.connect(accounts[0]).createProject(ZERO_ADDRESS, 100);
			const receipt: ContractReceipt = await tx.wait();
			const args: Result = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			const [projectId] = args;
			const project = await reBakedDAO.getProjectData(projectId);
			const timestamp: number = await getTimestamp();

			expect(project.initiator).to.equal(accounts[0].address);
			expect(project.token).to.equal(ZERO_ADDRESS);
			expect(project.isOwnToken).to.be.false;
			expect(project.budget).to.equal(100);
			expect(project.timeCreated).to.closeTo(timestamp, 10);
			expect(project.timeApproved).to.equal(0);
			expect(project.timeStarted).to.equal(0);
		});
	});

	describe("Testing `approveProject` function", () => {
		let tx: ContractTransaction;
		let receipt: ContractReceipt;
		let args: Result;
		let projectId: string;
		beforeEach(async () => {
			tx = await reBakedDAO.connect(accounts[0]).createProject(ZERO_ADDRESS, parseUnits("100", 18));
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];
		});

		it("[Fail]: Caller is not the owner", async () => {
			await expect(reBakedDAO.connect(accounts[0]).approveProject(projectId)).to.revertedWith("Ownable: caller is not the owner");
		});

		it("[Fail]: Approve a project that is not existed", async () => {
			await expect(reBakedDAO.connect(deployer).approveProject(formatBytes32String("test"))).to.revertedWith("no such project");
		});

		it("[OK]: Approve a project successfully", async () => {
			await expect(reBakedDAO.connect(deployer).approveProject(projectId)).to.emit(reBakedDAO, "ApprovedProject").withArgs(projectId);

			const project = await reBakedDAO.getProjectData(projectId);
			const timestamp = await getTimestamp();
			expect(project.timeApproved).to.closeTo(timestamp, 10);
		});

		it("[Fail]: Approve a project that is approved before", async () => {
			await reBakedDAO.connect(deployer).approveProject(projectId);
			await expect(reBakedDAO.connect(deployer).approveProject(projectId)).to.revertedWith("already approved project");
		});
	});

	describe("Testing `startProject` function", () => {
		let tx: ContractTransaction;
		let receipt: ContractReceipt;
		let args: Result;
		let projectId: string;
		let initiator: SignerWithAddress;
		beforeEach(async () => {
			initiator = accounts[0];
			tx = await reBakedDAO.connect(initiator).createProject(ZERO_ADDRESS, parseUnits("100", 18));
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
			await expect(reBakedDAO.connect(initiator).startProject(projectId)).to.emit(reBakedDAO, "StartedProject").withArgs(projectId, parseUnits("100", 18));
			const timestamp: number = await getTimestamp();
			project = await reBakedDAO.getProjectData(projectId);
			expect(project.token).not.equal(ZERO_ADDRESS);
			expect(project.timeStarted).to.closeTo(timestamp, 10);
		});
	});

	describe("Testing `createPackage` function", () => {
		let tx: ContractTransaction;
		let receipt: ContractReceipt;
		let args: Result;
		let projectId: string;
		let initiator: SignerWithAddress;
		beforeEach(async () => {
			initiator = accounts[0];
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(ZERO_ADDRESS, parseUnits("1000", 18));
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];
		});

		it("[Fail]: Caller is not initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).createPackage(projectId, parseUnits("100", 18), 10, 40)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Create new package with budget equal to 0", async () => {
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, 0, 10, 40)).to.revertedWith("Zero amount");
		});

		it("[Fail]: Project has not been started", async () => {
			await reBakedDAO.connect(deployer).approveProject(projectId);
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), parseUnits("10", 18), parseUnits("40", 18))).to.revertedWith("project is not started");
		});

		it("[Fail]: Project has been finished", async () => {
			await reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId);
			await reBakedDAO.connect(initiator).finishProject(projectId);
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), parseUnits("10", 18), parseUnits("40", 18))).to.revertedWith("project is finished");
		});

		it("[Fail]: Project budget left is not enough", async () => {
			reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId);
			await expect(reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("990", 18), parseUnits("10", 18), parseUnits("40", 18))).to.revertedWith("not enough project budget left");
		});

		it("[OK]: Create new package successfully", async () => {
			reBakedDAO.connect(deployer).approveProject(projectId);
			await reBakedDAO.connect(initiator).startProject(projectId);
			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), parseUnits("10", 18), parseUnits("40", 18));
			const packageReceipt: ContractReceipt = await packageTx.wait();
			const packageId: string = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];
			const createdPackage = await reBakedDAO.getPackageData(projectId, packageId);
			const timestamp = await getTimestamp();

			expect(createdPackage.budget).to.equal(parseUnits("100", 18));
			expect(createdPackage.budgetObservers).to.equal(parseUnits("40", 18));
			expect(createdPackage.bonus).to.equal(parseUnits("10", 18));
			expect(createdPackage.timeCreated).to.closeTo(timestamp, 10);
			expect(createdPackage.isActive).to.be.true;

			const currentProject = await reBakedDAO.getProjectData(projectId);
			expect(currentProject.budgetAllocated).to.equal(parseUnits("150", 18));
			expect(currentProject.totalPackages).to.equal(1);
		});
	});

	describe("Testing `addCollaborator` function", () => {
		let tx: ContractTransaction;
		let receipt: ContractReceipt;
		let args: Result;
		let projectId: string;
		let packageId: string;
		let initiator: SignerWithAddress;
		let collaborator: SignerWithAddress;
		let collaborator2: SignerWithAddress;
		beforeEach(async () => {
			collaborator = accounts[10];
			collaborator2 = accounts[11];
			initiator = accounts[0];
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, parseUnits("1000", 18));
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), parseUnits("10", 18), parseUnits("40", 18));
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).addCollaborator(projectId, packageId, collaborator.address, parseUnits("10", 18))).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Add collaborator with mgp zero", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator.address, 0)).to.revertedWith("Zero amount");
		});

		it("[Fail]: Collaborator has been added", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator.address, parseUnits("10", 18));
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator.address, parseUnits("10", 18))).to.revertedWith("collaborator already added");
		});

		it("[Fail]: Add collaborator with zero address", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, ZERO_ADDRESS, parseUnits("10", 18))).to.revertedWith("collaborator's address is zero");
		});

		it("[Fail]: Package is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, formatBytes32String("test"), collaborator.address, parseUnits("10", 18))).to.revertedWith("no such package");
		});

		it("[Fail]: Package has been canceled", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId, [], []);
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator.address, parseUnits("10", 18))).to.revertedWith("already canceled!");
		});

		it("[Fail]: Package budget is not enough to pay mgp", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator.address, parseUnits("101", 18))).to.revertedWith("not enough package budget left");
		});

		it("[OK]: Add collaborator successfully", async () => {
			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator.address, parseUnits("10", 18)))
				.to.emit(reBakedDAO, "AddedCollaborator")
				.withArgs(projectId, packageId, collaborator.address, parseUnits("10", 18));
			const addedCollaborator1 = await reBakedDAO.getCollaboratorData(projectId, packageId, collaborator.address);
			expect(addedCollaborator1.mgp).to.equal(parseUnits("10", 18));
			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId);
			expect(currentPackage.budgetAllocated).to.equal(parseUnits("10", 18));
			expect(currentPackage.totalCollaborators).to.equal(1);

			await expect(reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator2.address, parseUnits("20", 18)))
				.to.emit(reBakedDAO, "AddedCollaborator")
				.withArgs(projectId, packageId, collaborator2.address, parseUnits("20", 18));
			const addedCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId, collaborator2.address);
			expect(addedCollaborator2.mgp).to.equal(parseUnits("20", 18));
			currentPackage = await reBakedDAO.getPackageData(projectId, packageId);
			expect(currentPackage.budgetAllocated).to.equal(parseUnits("30", 18));
			expect(currentPackage.totalCollaborators).to.equal(2);
		});
	});

	describe("Testing `approveCollaborator` function", () => {
		let tx: ContractTransaction;
		let receipt: ContractReceipt;
		let args: Result;
		let projectId: string;
		let packageId: string;
		let initiator: SignerWithAddress;
		let collaborator: SignerWithAddress;
		let collaborator2: SignerWithAddress;
		beforeEach(async () => {
			collaborator = accounts[10];
			collaborator2 = accounts[11];
			initiator = accounts[0];
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, parseUnits("1000", 18));
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), parseUnits("10", 18), parseUnits("40", 18));
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator.address, parseUnits("10", 18));
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).approveCollaborator(projectId, packageId, collaborator.address, true)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Collaborator has not been added", async () => {
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator2.address, true)).to.revertedWith("Invalid Collaborator");
		});

		it("[Fail]: Collaborator has been approved", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator.address, true);
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator.address, true)).to.revertedWith("collaborator already approved");
		});

		it("[Fail]: Approve collaborator but package is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId, [], []);
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator.address, true)).to.revertedWith("already canceled!");
		});

		
		it("[OK]: Approve collaborator successfully", async () => {
			// Collaborator 1
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator.address, true)).to.emit(reBakedDAO, "ApprovedCollaborator").withArgs(projectId, packageId, collaborator.address, true);
			const timestamp = await getTimestamp();

			const currentCollaborator1 = await reBakedDAO.getCollaboratorData(projectId, packageId, collaborator.address);
			expect(currentCollaborator1.timeMgpApproved).to.closeTo(timestamp, 10);
			expect(currentCollaborator1.isRemoved).to.be.false;

			let currentPackage = await reBakedDAO.getPackageData(projectId, packageId);
			expect(currentPackage.approvedCollaborators).to.equal(1);

			// Collaborator 2
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator2.address, parseUnits("10", 18));
			await expect(reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator2.address, false)).to.emit(reBakedDAO, "ApprovedCollaborator").withArgs(projectId, packageId, collaborator2.address, false);

			const currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId, collaborator2.address);
			currentPackage = await reBakedDAO.getPackageData(projectId, packageId);
			expect(currentPackage.approvedCollaborators).to.equal(1);
			expect(currentPackage.totalCollaborators).to.equal(1);
			expect(currentPackage.budgetAllocated).to.equal(parseUnits("10", 18));
			expect(currentCollaborator2.mgp).to.equal(0);
		});
	});

	/** Missing test case, Waiting for BA */
	describe("Testing `removeCollaborator` function", () => {
		let tx: ContractTransaction;
		let receipt: ContractReceipt;
		let args: Result;
		let projectId: string;
		let packageId: string;
		let initiator: SignerWithAddress;
		let collaborator: SignerWithAddress;
		let collaborator2: SignerWithAddress;
		beforeEach(async () => {
			collaborator = accounts[10];
			collaborator2 = accounts[11];
			initiator = accounts[0];
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, parseUnits("1000", 18));
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), parseUnits("10", 18), parseUnits("40", 18));
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator.address, parseUnits("10", 18));
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).removeCollaborator(projectId, packageId, collaborator.address, true)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Remove collaborator with zero address", async () => {
			await expect(reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId, ZERO_ADDRESS, true)).to.revertedWith("collaborator's address is zero");
		});

		it.skip("[Fail]: Remove collaborator after package finish", async () => {
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator.address, true);
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId);
			await expect(reBakedDAO.connect(initiator).removeCollaborator(projectId, packageId, collaborator.address, true)).to.revertedWith("collaborator's address is zero");
		});
	});

	describe("Testing `addObserver` function", () => {
		let tx: ContractTransaction;
		let receipt: ContractReceipt;
		let args: Result;
		let projectId: string;
		let packageId1: string;
		let packageId2: string;
		let initiator: SignerWithAddress;
		let collaborator: SignerWithAddress;
		let observer1: SignerWithAddress;
		let observer2: SignerWithAddress;
		beforeEach(async () => {
			collaborator = accounts[10];
			observer1 = accounts[12];
			observer2 = accounts[13];
			initiator = accounts[0];
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, parseUnits("1000", 18));
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), parseUnits("10", 18), parseUnits("40", 18));
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), parseUnits("10", 18), parseUnits("40", 18));
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator.address, parseUnits("10", 18));

			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator.address, true);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).addObserver(projectId, [packageId1], observer1.address)).to.revertedWith("caller is not project initiator");
		});

		it("[Fail]: Add observer with zero address", async () => {
			await expect(reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], ZERO_ADDRESS)).to.revertedWith("observer's address is zero");
		});

		it("[Fail]: Observer has been added", async () => {
			// await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], observer1.address);
			// await expect(reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address)).to.revertedWith("observer already added");
		});

		it("[Fail]: Add observer to a package that is not existed", async () => {
			await expect(reBakedDAO.connect(initiator).addObserver(projectId, [formatBytes32String("test")], observer1.address)).to.revertedWith("no such package");
		});

		it("[Fail]: Add observer to a package that is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId1, [], []);
			await expect(reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address)).to.revertedWith("already canceled!");
		});

		it("[Fail]: Add observer to a package that has been finished", async () => {
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId1);
			await expect(reBakedDAO.connect(initiator).addObserver(projectId, [packageId1], observer1.address)).to.revertedWith("already finished package");
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
		let tx: ContractTransaction;
		let receipt: ContractReceipt;
		let args: Result;
		let projectId: string;
		let packageId1: string;
		let packageId2: string;
		let initiator: SignerWithAddress;
		let collaborator: SignerWithAddress;
		let observer1: SignerWithAddress;
		let observer2: SignerWithAddress;
		beforeEach(async () => {
			collaborator = accounts[10];
			observer1 = accounts[12];
			observer2 = accounts[13];
			initiator = accounts[0];
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, parseUnits("1000", 18));
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			let packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), parseUnits("10", 18), parseUnits("40", 18));
			let packageReceipt: ContractReceipt = await packageTx.wait();
			packageId1 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			packageTx = await reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), parseUnits("10", 18), parseUnits("40", 18));
			packageReceipt = await packageTx.wait();
			packageId2 = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId1, collaborator.address, parseUnits("10", 18));

			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId1, collaborator.address, true);
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], observer1.address);
			await reBakedDAO.connect(initiator).addObserver(projectId, [packageId1, packageId2], observer2.address);
		});

		it("[Fail]: Caller is not the initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).removeObserver(projectId, [packageId1], observer1.address)).to.revertedWith("caller is not project initiator");
		});

		/** Missing */
		it("[Fail]: Remove observer but package is not existed", async () => {});

		/** Missing */
		it("[Fail]: Remove observer but package is not active", async () => {});

		/** Missing */
		it("[OK]: Remove observer successfully", async () => {});
	});

	/** Missing */
	describe("Testing `setBonusScores` function", () => {
		let tx: ContractTransaction;
		let receipt: ContractReceipt;
		let args: Result;
		let projectId: string;
		let packageId: string;
		let initiator: SignerWithAddress;
		let collaborator1: SignerWithAddress;
		let collaborator2: SignerWithAddress;
		beforeEach(async () => {
			collaborator1 = accounts[10];
			collaborator2 = accounts[11];
			initiator = accounts[0];
			await iouToken.connect(initiator).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(initiator).createProject(iouToken.address, parseUnits("1000", 18));
			receipt = await tx.wait();
			args = receipt.events!.find((ev) => ev.event === "CreatedProject")!.args!;
			projectId = args[0];

			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), parseUnits("10", 18), parseUnits("40", 18));
			const packageReceipt: ContractReceipt = await packageTx.wait();
			packageId = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];

			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator1.address, parseUnits("10", 18));
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator1.address, true);
		});

		it("[Fail]: Array score is empty", async () => {
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId, [collaborator1.address], [])).to.revertedWith("Empty array");
		});

		it("[Fail]: Caller is not the owner", async () => {
			await expect(reBakedDAO.connect(initiator).setBonusScores(projectId, packageId, [collaborator1.address], [10])).to.revertedWith("Ownable: caller is not the owner");
		});

		it("[Fail]: Array length of collaboratos and scores are not match", async () => {
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId, [collaborator1.address], [9, 10])).to.revertedWith("arrays length mismatch");
		});

		it("[Fail]: Set bonus scores for collaborator that is not added to package", async () => {
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId, [collaborator2.address], [9])).to.revertedWith("no such collaborator");
		});

		/** Waiting for fixing */
		it("[Fail]: Collaborator has been setBonusScores", async () => {
			// await reBakedDAO.connect(deployer).setBonusScores(projectId, packageId, [collaborator1.address, collaborator2.address], [9, 10]);
			// await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId, [collaborator1.address], [10]))
			// 	.to.revertedWith("collaborator bonus already set");
		});

		it("[Fail]: Set bonus scores for collaborator but package is not active", async () => {
			await reBakedDAO.connect(initiator).cancelPackage(projectId, packageId, [], []);
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId, [collaborator1.address], [10])).to.revertedWith("already canceled!");
		});

		it("[Fail]: Bonus of package is zero", async () => {
			const packageTx: ContractTransaction = await reBakedDAO.connect(initiator).createPackage(projectId, parseUnits("100", 18), 0, parseUnits("40", 18));
			const packageReceipt: ContractReceipt = await packageTx.wait();
			const packageId = packageReceipt.events!.find((ev) => ev.event === "CreatedPackage")!.args![1];
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator1.address, parseUnits("10", 18));
			reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator1.address, true);

			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId, [collaborator1.address], [10])).to.revertedWith("bonus budget is zero");
		});

		it("[Fail]: Set bonus scores but package is not finished", async () => {
			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId, [collaborator1.address], [10])).to.revertedWith("package is not finished");
		});

		it("[Fail]: Bonus left of package is not enough", async () => {
			const maxBonusScores = await reBakedDAO.PCT_PRECISION();
			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId);

			await expect(reBakedDAO.connect(deployer).setBonusScores(projectId, packageId, [collaborator1.address], [maxBonusScores + 1])).to.revertedWith("no more bonus left");
		});

		it("Set bonus scores successfully", async () => {
			await reBakedDAO.connect(initiator).addCollaborator(projectId, packageId, collaborator2.address, parseUnits("20", 18));
			await reBakedDAO.connect(initiator).approveCollaborator(projectId, packageId, collaborator2.address, true);

			await reBakedDAO.connect(initiator).finishPackage(projectId, packageId);
			await reBakedDAO.connect(deployer).setBonusScores(projectId, packageId, [collaborator1.address, collaborator2.address], [14, 15]);

			const currentCollaborator1 = await reBakedDAO.getCollaboratorData(projectId, packageId, collaborator1.address);
			const currentCollaborator2 = await reBakedDAO.getCollaboratorData(projectId, packageId, collaborator2.address);
			const currentPackage = await reBakedDAO.getPackageData(projectId, packageId);

			expect(currentCollaborator1.bonusScore).to.equal(14);
			expect(currentCollaborator2.bonusScore).to.equal(15);
			expect(currentPackage.bonusAllocated).to.equal(29);
		});
	});
});
