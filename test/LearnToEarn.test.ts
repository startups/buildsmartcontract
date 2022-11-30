import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits, formatBytes32String } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LearnToEarn, LearnToEarn__factory, IOUToken, IOUToken__factory, TokenFactory, TokenFactory__factory, NFTReward, NFTReward__factory } from "../typechain-types";
import { ZERO_ADDRESS, MAX_UINT256, getTimestamp, getBlock, solidityKeccak256, skipTime } from "./utils";
import { Result } from "@ethersproject/abi";
import { ContractReceipt, ContractTransaction } from "ethers";

// Contract Variables
let deployer: SignerWithAddress;
let creator: SignerWithAddress;
let accounts: SignerWithAddress[];
let tokenFactory: TokenFactory;
let learnToEarn: LearnToEarn;

let tx: ContractTransaction;
let receipt: ContractReceipt;
let args: Result;
let courseId: string;
let learner1: SignerWithAddress;
let learner2: SignerWithAddress;

describe("LearnToEarn contract", () => {
    beforeEach(async () => {
		[deployer, creator, learner1, learner2, ...accounts] = await ethers.getSigners();
        const NFTReward_factory = (await ethers.getContractFactory("NFTReward")) as NFTReward__factory;
        const TokenFactory_factory = (await ethers.getContractFactory("TokenFactory")) as TokenFactory__factory;
        const LearnToEarn_factory = (await ethers.getContractFactory("LearnToEarn")) as LearnToEarn__factory;

        const nftReward = await NFTReward_factory.deploy();
        await nftReward.deployed();

        tokenFactory = (await upgrades.deployProxy(TokenFactory_factory, [nftReward.address])) as TokenFactory;
        learnToEarn = (await upgrades.deployProxy(LearnToEarn_factory, [])) as LearnToEarn;
    });


})
