const { ethers, upgrades } = require("hardhat");
const fs = require("fs");

async function main() {
  // Loading accounts
  const accounts = await ethers.getSigners();
  const deployer = accounts[0];

  // const CollaboratorLibrary = await ethers.getContractFactory("CollaboratorLibrary");
  // const ObserverLibrary = await ethers.getContractFactory("ObserverLibrary");
  // const PackageLibrary = await ethers.getContractFactory("PackageLibrary");
  // const ProjectLibrary = await ethers.getContractFactory("ProjectLibrary");
  // const TokenFactory = await ethers.getContractFactory("TokenFactory");

  // const tokenFactory = await upgrades.deployProxy(TokenFactory);
  // await tokenFactory.deployed();
  // console.log("TokenFactory         deployed to:", tokenFactory.address);

  // const collaboratorLibrary = await CollaboratorLibrary.deploy();
  // await collaboratorLibrary.deployed();
  // console.log("CollaboratorLibrary  deployed to:", collaboratorLibrary.address);

  // const observerLibrary = await ObserverLibrary.deploy();
  // await observerLibrary.deployed();
  // console.log("ObserverLibrary       deployed to:", observerLibrary.address);

  // const packageLibrary = await PackageLibrary.deploy();
  // await packageLibrary.deployed();
  // console.log("PackageLibrary       deployed to:", packageLibrary.address);

  // const projectLibrary = await ProjectLibrary.deploy();
  // await projectLibrary.deployed();
  // console.log("ProjectLibrary       deployed to:", projectLibrary.address);


  const ReBakedDAO = await ethers.getContractFactory("ReBakedDAO"
    // {
    //   libraries: {
    //     CollaboratorLibrary: "0xbc1FEea515fC2375f04531E7997c79B29dc5E3CC",
    //     ObserverLibrary: "0x21Cb32df2A873285924d006361785469FA5fc7d6",
    //     PackageLibrary: "0x5fAfE95722A7fEf75816076cb7ee3aa13013dC0F",
    //     ProjectLibrary: "0x5b3De4030915e21d9d84dD4692CbFCA3A7Fd4D72"
    //   },
    // }
  );


  // const reBakedDAO = await ReBakedDAO.deploy(
  //   "0xD90A5DB9EbFeb22e374Cd44830250B297085d5c3",
  //   // tokenFactory.address
  //   "0x027594fF9B44b2EbebeaF8aEdF8A426A2A988781"
  // );
  // await reBakedDAO.deployed();

  // // Deploying
  // const reBakedDAO = await upgrades.deployProxy(ReBakedDAO, [
  //   "0xD90A5DB9EbFeb22e374Cd44830250B297085d5c3"
  // ]);
  // await reBakedDAO.deployed();

  // Upgrading
  const reBakedDAO = await upgrades.upgradeProxy("0x42472dB3d10d5AA6dE423F876CA555f803eF8ADD", ReBakedDAO);

  console.log("ReBakedDAO               deployed to:", reBakedDAO.address);

  // const tx = await tokenFactory.setReBakedDao(reBakedDAO.address);
  // await tx.wait();

  // const contractAddresses = {
  //   "CollaboratorLibrary": "0xbc1FEea515fC2375f04531E7997c79B29dc5E3CC",
  //   "ObserverLibrary": "0x21Cb32df2A873285924d006361785469FA5fc7d6",
  //   "PackageLibrary": "0x5fAfE95722A7fEf75816076cb7ee3aa13013dC0F",
  //   "ProjectLibrary": "0x5b3De4030915e21d9d84dD4692CbFCA3A7Fd4D72",
  //   "TokenFactory": tokenFactory.address,
  //   "ReBakedDAO": reBakedDAO.address,
  // };
  // fs.writeFileSync("contracts.json", JSON.stringify(contractAddresses));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
