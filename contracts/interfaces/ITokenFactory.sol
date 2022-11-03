// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

interface ITokenFactory {
    function deployToken(uint256 totalSupply_) external returns (address);
}
