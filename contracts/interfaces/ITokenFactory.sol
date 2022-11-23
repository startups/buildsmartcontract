// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

interface ITokenFactory {
    event DeployedToken(address indexed token, uint256 indexed totalSupply);

    function deployToken(uint256 totalSupply_, string memory name_, string memory symbol_) external returns (address);
}
