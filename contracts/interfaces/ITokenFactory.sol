// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

interface ITokenFactory {
    event DeployedToken(address indexed token, uint256 indexed totalSupply);
    event SetLearnToEarn(address indexed oldLearnToEarn, address indexed newLearnToEarn);
    event DeployNFT(address indexed nft);

    function deployToken(uint256 totalSupply_, string memory name_, string memory symbol_) external returns (address);
    function deployNFT(string memory name_, string memory symbol_) external returns (address);
}
