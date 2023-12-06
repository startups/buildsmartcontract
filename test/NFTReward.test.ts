import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ZERO_ADDRESS } from "./utils";
import { NFTReward, NFTReward__factory, LearnToEarn, LearnToEarn__factory } from "../typechain-types";

let deployer: SignerWithAddress;
let accounts: SignerWithAddress[];
let NFTReward_Factory: NFTReward__factory;
let learnToEarn: LearnToEarn;

const tokenName = "Pioneer Certificate",
	tokenSymbol = "PICE",
    tokenURI = "https://ipfs.io/ipfs/QmNZiPk974vDsPmQii3YbrMKfi12KTSNM7XMiYyiea4VYZ/example";

describe("NFTReward contract", async () => {
    beforeEach(async () => {
		[deployer, ...accounts] = await ethers.getSigners();
		NFTReward_Factory = (await ethers.getContractFactory("NFTReward")) as NFTReward__factory;
		const LearnToEarn_factory = (await ethers.getContractFactory("LearnToEarn")) as LearnToEarn__factory;

		learnToEarn = (await upgrades.deployProxy(LearnToEarn_factory, [])) as LearnToEarn;
	});
    
    describe("Testing `initialized` function", () => {
        it("[Fail]: LearnToEarn is not valid", async () => {
            await expect(upgrades.deployProxy(NFTReward_Factory, [ZERO_ADDRESS, tokenName, tokenSymbol, tokenURI])).to.revertedWith("LearnToEarn address is not valid");
        });

        it("[OK]: Deploy successfully", async () => {
            const nftReward = (await upgrades.deployProxy(NFTReward_Factory, [learnToEarn.address, tokenName, tokenSymbol, tokenURI])) as NFTReward;
            expect(await nftReward.learnToEarn()).to.equal(learnToEarn.address);
            expect(await nftReward.tokenIds()).to.equal(0);
            expect(await nftReward.uri()).to.equal(tokenURI);
        });
    })

    describe("Testing `mint` function", () => {
        let nftReward: NFTReward;
        beforeEach(async () => {
            nftReward = (await upgrades.deployProxy(NFTReward_Factory, [learnToEarn.address, tokenName, tokenSymbol, tokenURI])) as NFTReward;
        });

        it("[Fail]: Caller is not learnToEarn", async () => {
            await expect(nftReward.connect(deployer).mint(accounts[0].address)).to.revertedWith("Caller is not learnToEarn");
        });
    })
});