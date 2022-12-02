import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ERC721Test, ERC721Test__factory } from "../typechain-types";
import { ZERO_ADDRESS } from "./utils";

let deployer: SignerWithAddress;
let accounts: SignerWithAddress[];

let erc721Test: ERC721Test;

const nftName = "Pioneer Certificate",
	nftSymbol = "PICE",
	nftURI = "https://ipfs.io/ipfs/QmNZiPk974vDsPmQii3YbrMKfi12KTSNM7XMiYyiea4VYZ/example";

describe("ERC721Test contract", () => {
    beforeEach(async () => {
		[deployer, ...accounts] = await ethers.getSigners();
		const ERC721Test_factory = (await ethers.getContractFactory("ERC721Test")) as ERC721Test__factory;

		erc721Test = await ERC721Test_factory.deploy(nftName, nftSymbol);
		await erc721Test.deployed();
	});

	it("validate initial state of contract", async () => {
		expect(await erc721Test.owner()).to.equal(deployer.address);
		expect(await erc721Test.name()).to.equal(nftName);
		expect(await erc721Test.symbol()).to.equal(nftSymbol);
	});

	describe("Testing `mintNFT` function", () => {
		it("[Fail]: Caller is not owner", async () => {
			await expect(erc721Test.connect(accounts[0]).mintNFT(accounts[0].address, nftURI)).to.revertedWith("Ownable: caller is not the owner");
		});

		it("[Fail]: Mint to ZERO_ADDRESS", async () => {
			await expect(erc721Test.connect(deployer).mintNFT(ZERO_ADDRESS, nftURI)).to.revertedWith("Invalid address");
		});

		it("[OK]: Mint new NFT successfully", async () => {
			await expect(erc721Test.connect(deployer).mintNFT(accounts[0].address, nftURI)).to.emit(erc721Test, "MintedNFT").withArgs(accounts[0].address, 1, nftURI);
			expect(await erc721Test.ownerOf(1)).to.equal(accounts[0].address);
			expect(await erc721Test.tokenURI(1)).to.equal(nftURI);
		});
	});
})