const hre = require("hardhat");
// const contracts = require("../contracts.json");

async function main() {
  try {
    await hre.run("verify:verify", {
      // address: contracts.ReBakedDAO,
      address: "0x214aa9d01418561df8d6556a0c50a158ea9fa98f",
      // constructorArguments: [
      //   "0xD90A5DB9EbFeb22e374Cd44830250B297085d5c3",
      //   "0x027594fF9B44b2EbebeaF8aEdF8A426A2A988781"
      // ],
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  // try {
  //   await hre.run("verify:verify", {
  //     address: "0x027594fF9B44b2EbebeaF8aEdF8A426A2A988781",
  //   });
  // } catch (err) {
  //   console.log("err :>> ", err);
  // }

  // 0xFC10FE756f01D405CeBb465A07A00AF79b93F54f
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
