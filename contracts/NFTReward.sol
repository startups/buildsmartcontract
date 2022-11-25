// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 *  @title  NFTReward Contract
 *  @author ReBaked Team
 */

 contract NFTReward is ERC721 {

    address public learnToEarn;
    uint256 private _tokenIds;

    constructor(address _learnToEarn, string memory _name, string memory _symbol) ERC721(_name, _symbol) {
        learnToEarn = _learnToEarn;
    }

    function mint(address _to) external {
        require(_msgSender() == learnToEarn, "Caller is not learnToEarn");
        _mint(_to, ++_tokenIds);
    }
 }