const hre = require("hardhat");


async function main() {
  try {
    await hre.run("verify:verify", {
      address: "0x61A0f6dd8065B5043d01E8C078Fa3b560E83117B",
      constructorArguments: [
        "0xD90A5DB9EbFeb22e374Cd44830250B297085d5c3",
        1000,
        500,
        "0x027594fF9B44b2EbebeaF8aEdF8A426A2A988781"
      ],
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
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
