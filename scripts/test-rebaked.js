const hre = require("hardhat");
const ethers = hre.ethers;
const ReBakedDAO = require("./ReBakedDAO.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  const proxyReBakedDAO = "0x5aA68693cABF158558C16042D7449D602b821DE0";
  const implementationReBakedDAO = "0x0481De78edA83a061119e918d1C95dbEdB864979";
  
  const reBakedDao = new ethers.Contract(
    proxyReBakedDAO,
    ReBakedDAO.abi,
    deployer
  );
  // const reBakedDao = factory.attach(proxyReBakedDAO);

  const tokenFactory = await reBakedDao.tokenFactory();
  console.log({ tokenFactory });

  const treasury = await reBakedDao.treasury();
  console.log({ treasury });

  const contractOwner = await reBakedDao.owner();
  console.log({ contractOwner });

  // const projectObj = await reBakedDAO
  //   .getProjectData("0xb70b60467dbb7dd6911563b6615b6a0e4a274f482fb7b14cd79abfb50ee04034");
  // console.log({projectObj});

  // try {
  //   const createProjectTx = await reBakedDAO.createProject(
  //     "0x077ffc33b12ac8CFfF5B9F71658bc6575E16a113",
  //     10,
  //     {
  //       gasLimit: 400000
  //     }
  //   );

  //   console.log("createProjectTx:");
  //   console.log(createProjectTx);
    
  // } catch (error) {
  //   console.log("error");
  //   console.log(error);
  // }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
