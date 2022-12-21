// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { IERC721, ERC721, ERC721URIStorage } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev This contract is using for testing create course with external NFT Contract
 */
contract ERC721Test is ERC721URIStorage, Ownable {
    event MintedNFT(address to, uint256 tokenId, string uri);

    /**
     * @notice ID of Minted NFT, increase by 1
     */
    uint256 public tokenIds;

    /**
     * @notice Function called when contract is deployed
     * @param name Name of NFT
     * @param symbol Symbol of NFT
     */
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

    /**
     * @notice mint a NFT for _to address
     * @param _to address of user
     * @param _uri Ipfs link of NFT
     * 
     * emit { MintedNFT } events
     */
    function mintNFT(address _to, string memory _uri) external onlyOwner {
        require(_to != address(0), "Invalid address");
        tokenIds++;
        _safeMint(_to, tokenIds);
        _setTokenURI(tokenIds, _uri);

        emit MintedNFT(_to, tokenIds, _uri);
    }
}