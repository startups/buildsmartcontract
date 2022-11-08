// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

interface ITokenFactory {
    event DeployedToken(address indexed token, uint256 indexed totalSupply);
    event SetRebakedDao(address indexed oldRebakedDao, address indexed newRebakedDao);

    function deployToken(uint256 totalSupply_, string memory name_, string memory symbol_) external returns (address);
}
