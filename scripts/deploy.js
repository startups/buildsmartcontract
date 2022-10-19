const hre = require("hardhat");
const ethers = hre.ethers;

async function main() {
  //Loading accounts
  const accounts = await ethers.getSigners();
  const deployer = accounts[0];

  const CollaboratorLibrary = await ethers.getContractFactory("CollaboratorLibrary");
  const PackageLibrary = await ethers.getContractFactory("PackageLibrary");
  const ProjectLibrary = await ethers.getContractFactory("ProjectLibrary");
  const TokenFactory = await ethers.getContractFactory("TokenFactory");

  // const tokenFactory = await TokenFactory.deploy();
  // await tokenFactory.deployed();
  // console.log("TokenFactory         deployed to:", tokenFactory.address);

  // const collaboratorLibrary = await CollaboratorLibrary.deploy();
  // await collaboratorLibrary.deployed();
  // console.log("Collaborators         deployed to:", collaboratorLibrary.address);

  // const packageLibrary = await PackageLibrary.deploy();
  // await packageLibrary.deployed();
  // console.log("Packages         deployed to:", packageLibrary.address);

  // const projectLibrary = await ProjectLibrary.deploy();
  // await projectLibrary.deployed();
  // console.log("Projects         deployed to:", projectLibrary.address);


  const ReBakedDAO = await ethers.getContractFactory("ReBakedDAO", {
    libraries: {
      CollaboratorLibrary: "0x6c49B92b51d00D7580cc25F1168027964b3c17B3",
      PackageLibrary: "0x96E1DD23a767bc77F54793c37bfc52f12493a55c",
      ProjectLibrary: "0xfD18f237B0F4800477BBAF296eAcb94405d657F1"
    },
  });
  const reBakedDAO = await ReBakedDAO.deploy(
    "0xD90A5DB9EbFeb22e374Cd44830250B297085d5c3",
    1000,
    500,
    // tokenFactory.address
    "0x027594fF9B44b2EbebeaF8aEdF8A426A2A988781"
  );
  await reBakedDAO.deployed();
  console.log("ReBakedDAO         deployed to:", reBakedDAO.address);

  // let tx = await tokenFactory.setReBakedDao(reBakedDAO.address);
  // await tx.wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
