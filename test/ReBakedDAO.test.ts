// const { expect } = require("chai");
// const { ethers } = require("hardhat");
// const { BigNumber } = require("ethers");

// describe("ReBakedDAO", () => {
//   let deployer;
//   let accounts;
//   let reBakedDAO;
//   let collaborators;
//   let packages;
//   let projects;
//   let tokenFactory;
//   let iouToken;

//   beforeEach(async () => {
//     [deployer, ...accounts] = await ethers.getSigners();

//     const Collaborators = await ethers.getContractFactory("CollaboratorLibrary");
//     const Packages = await ethers.getContractFactory("PackageLibrary");
//     const Projects = await ethers.getContractFactory("ProjectLibrary");
//     const TokenFactory = await ethers.getContractFactory("TokenFactory");
//     const IOUToken = await ethers.getContractFactory("IOUToken");

//     tokenFactory = await TokenFactory.deploy();
//     await tokenFactory.deployed();
//     // console.log("\tTokenFactory         deployed to:", tokenFactory.address);

//     collaborators = await Collaborators.deploy();
//     await collaborators.deployed();
//     // console.log("\tCollaborators         deployed to:", collaborators.address);

//     packages = await Packages.deploy();
//     await packages.deployed();
//     // console.log("\tPackages         deployed to:", packages.address);

//     projects = await Projects.deploy();
//     await projects.deployed();
//     // console.log("\tProjects         deployed to:", projects.address);

//     iouToken = await IOUToken.deploy(
//       accounts[0].address,
//       "10000000000000000000000"
//     );
//     await iouToken.deployed();
//     // console.log("\tIOUToken         deployed to:", iouToken.address);

//     const ReBakedDAO = await ethers.getContractFactory("ReBakedDAO", {
//       libraries: {
//         CollaboratorLibrary: collaborators.address,
//         PackageLibrary: packages.address,
//         ProjectLibrary: projects.address
//       },
//     });
//     reBakedDAO = await ReBakedDAO.deploy(
//       accounts[0].address,
//       100,
//       50,
//       tokenFactory.address
//     );
//     await reBakedDAO.deployed();
//     // console.log("\tReBakedDAO         deployed to:", reBakedDAO.address);
//   });

//   describe("Validating initialized state of contracts", () => {
//     it("Validating initialized state of ReBakedDAO", async function () {

//       const owner = await reBakedDAO.owner();
//       expect(owner).to.equal(deployer.address);

//       const treasury = await reBakedDAO.treasury();
//       expect(treasury).to.equal(accounts[0].address);

//       await iouToken.connect(accounts[0]).approve(
//         reBakedDAO.address,
//         "30000000000000000000"
//       );

//       const projectId = await reBakedDAO.connect(accounts[0]).createProject(
//         iouToken.address,
//         "10"
//       );
//       console.log({ projectId });
//     });
//   });
// });

