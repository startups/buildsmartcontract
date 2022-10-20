import { expect } from "chai";
import { ethers } from "hardhat";
import { parseEther, formatBytes32String } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ReBakedDAO, ReBakedDAO__factory, Packages, Packages__factory, Collaborators, Collaborators__factory, Projects, Projects__factory, TokenFactory, TokenFactory__factory, IOUToken, IOUToken__factory } from "../typechain-types";
import { ZERO_ADDRESS, MAX_UINT256, getTimestamp } from "./utils";
import { TransactionResponse, TransactionReceipt } from "@ethersproject/abstract-provider";

describe("ReBakedDAO", () => {
	let deployer: SignerWithAddress;
	let treasury: SignerWithAddress;
	let accounts: SignerWithAddress[];
	let reBakedDAO: ReBakedDAO;
	let collaborators: Collaborators;
	let packages: Packages;
	let projects: Projects;
	let tokenFactory: TokenFactory;
	let iouToken: IOUToken;

	beforeEach(async () => {
		[deployer, treasury, ...accounts] = await ethers.getSigners();

		const Collaborators = (await ethers.getContractFactory("CollaboratorLibrary")) as Collaborators__factory;
		const Packages = (await ethers.getContractFactory("PackageLibrary")) as Packages__factory;
		const Projects = (await ethers.getContractFactory("ProjectLibrary")) as Projects__factory;
		const TokenFactory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
		const IOUToken = (await ethers.getContractFactory("IOUToken")) as IOUToken__factory;

		tokenFactory = await TokenFactory.deploy();
		await tokenFactory.deployed();
		// console.log("\tTokenFactory         deployed to:", tokenFactory.address);

		collaborators = await Collaborators.deploy();
		await collaborators.deployed();
		// console.log("\tCollaborators         deployed to:", collaborators.address);

		packages = await Packages.deploy();
		await packages.deployed();
		// console.log("\tPackages         deployed to:", packages.address);

		projects = await Projects.deploy();
		await projects.deployed();
		// console.log("\tProjects         deployed to:", projects.address);

		iouToken = await IOUToken.deploy(accounts[0].address, "10000000000000000000000");
		await iouToken.deployed();
		// console.log("\tIOUToken         deployed to:", iouToken.address);

		const ReBakedDAO = (await ethers.getContractFactory("ReBakedDAO", {
			libraries: {
				CollaboratorLibrary: collaborators.address,
				PackageLibrary: packages.address,
				ProjectLibrary: projects.address,
			},
		})) as ReBakedDAO__factory;
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
				await expect(reBakedDAO.connect(accounts[0]).createProject(iouToken.address, 0)).to.revertedWith("amount must be greater than 0");
			});

			it("[Fail]: Create new project with existed token that has not been approved to transfer", async () => {
				await expect(reBakedDAO.connect(accounts[0]).createProject(iouToken.address, 3000)).to.revertedWith("ERC20: insufficient allowance");
			});

			it("[OK]: Create new project successfully", async () => {
				await iouToken.connect(accounts[0]).approve(reBakedDAO.address, MAX_UINT256);

				const tx: TransactionResponse = await reBakedDAO.connect(accounts[0]).createProject(iouToken.address, 100);
				const receipt: TransactionReceipt = await tx.wait();
				const args: any[] = receipt.events.find((ev) => ev.event === "CreatedProject")?.args;
				const projectId = args[0];
				const project = await reBakedDAO.getProjectData(projectId);
				const timestamp: number = await getTimestamp();

				expect(project.initiator).to.equal(accounts[0].address);
				expect(project.token).to.equal(iouToken.address);
				expect(project.isOwnToken).to.be.true;
				expect(project.budget).to.equal(100);
				expect(project.timeCreated).to.closeTo(timestamp, 10);
				expect(project.timeApproved).to.closeTo(timestamp, 10);
				expect(project.timeStarted).to.closeTo(timestamp, 10);
			});

			it("[OK]: Token balance has been changed after creating project", async () => {
				await iouToken.connect(accounts[0]).approve(reBakedDAO.address, MAX_UINT256);
				await expect(reBakedDAO.connect(accounts[0]).createProject(iouToken.address, 10)).changeTokenBalances(iouToken, [accounts[0], reBakedDAO], [parseEther("-10"), parseEther("10")]);
			});
		});

		describe("Create new project without existed token succesfully", async () => {
			const tx: TransactionResponse = await reBakedDAO.connect(accounts[0]).createProject(ZERO_ADDRESS, 100);
			const receipt: TransactionReceipt = await tx.wait();
			const args = receipt.events.find((ev) => ev.event === "CreatedProject")?.args;
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
		let tx: TransactionResponse;
		let receipt: TransactionReceipt;
		let args: any[];
		let projectId: string;
		beforeEach(async () => {
			tx = await reBakedDAO.connect(accounts[0]).createProject(ZERO_ADDRESS, 100);
			receipt = await tx.wait();
			args = receipt.events.find((ev) => ev.event === "CreatedProject")?.args;
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

	// Waiting for fixing startProject function
	describe("Testing `startProject` function", () => {
		let tx: TransactionResponse;
		let receipt: TransactionReceipt;
		let args: any[];
		let projectId: string;
		beforeEach(async () => {
			tx = await reBakedDAO.connect(accounts[0]).createProject(ZERO_ADDRESS, 100);
			receipt = await tx.wait();
			args = receipt.events.find((ev) => ev.event === "CreatedProject")?.args;
			projectId = args[0];
		});

		it("[Fail]: Caller is not the initiator of the project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).startProject(projectId)).to.revertedWith("caller is not the project initiator");
		});
	});

	describe("Testing `createPackage` function", () => {
		let tx: TransactionResponse;
		let receipt: TransactionReceipt;
		let args: any[];
		let projectId: string;
		beforeEach(async () => {
			await iouToken.connect(accounts[0]).approve(reBakedDAO.address, MAX_UINT256);
			tx = await reBakedDAO.connect(accounts[0]).createProject(iouToken.address, 1000);
			receipt = await tx.wait();
			args = receipt.events.find((ev) => ev.event === "CreatedProject")?.args;
			projectId = args[0];
		});

		it("[Fail]: Caller is not initiator of project", async () => {
			await expect(reBakedDAO.connect(accounts[1]).createPackage(projectId, 100, 10, 40))
				.to.revertedWith("caller is not the project initiator");
		});

		it("[Fail]: Create new package with budget equal to 0", async () => {
			await expect(reBakedDAO.connect(accounts[1]).createPackage(projectId, 100, 10, 40))
				.to.revertedWith("amount must be greater than 0");
		});
	});
});
