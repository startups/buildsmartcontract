// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { IERC721, ERC721, ERC721URIStorage } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 *  @title  NFTReward Contract
 *  @author ReBaked Team
 */

 contract NFTReward is ERC721URIStorage {

    event Minted(address account, uint256 tokenId);

    address public learnToEarn;
    uint256 private _tokenIds;

    constructor(address _learnToEarn, string memory _name, string memory _symbol) ERC721(_name, _symbol) {
        learnToEarn = _learnToEarn;
    }

    /**
     * @notice mint a NFT for _to address
     * @param _to address of user
     * 
     * emit { Minted } events
     */
    function mint(address _to) external {
        require(_msgSender() == learnToEarn, "Caller is not learnToEarn");
        ++_tokenIds;
        _safeMint(_to, _tokenIds);

        emit Minted(_to, _tokenIds);
    }
 }