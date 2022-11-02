const hre = require("hardhat");
const ethers = hre.ethers;
const ReBakedDAO = require("./ReBakedDAO.json");

async function main() {
  const [owner, user] = await ethers.getSigners();
  const addressReBakedDAO = "0xe6f3a1dbf03a4862330192ccf85c9c216ad565f9";
  const reBakedDAO = new ethers.Contract(
    addressReBakedDAO,
    ReBakedDAO.abi,
    user
  );

  const tokenFactory = await reBakedDAO.tokenFactory();
  console.log({ tokenFactory });

  const treasury = await reBakedDAO.treasury();
  console.log({ treasury });

  const contractOwner = await reBakedDAO.owner();
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
