// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { ITokenFactory } from "./interfaces/ITokenFactory.sol";
import { IOUToken } from "./IOUToken.sol";

/**
 *  @title  TokenFactory Contract
 *  @notice This contract using for creating IOU Token
 */
contract TokenFactory is ITokenFactory {
    constructor() {}

    /**
     * @notice Deploys IOUT with totalSupply equal to project budget
     * @param _totalSupply Token total supply
     * @return token_ IOU token address
     */
    function deployToken(
        uint256 _totalSupply,
        string memory _name,
        string memory _symbol
    ) external returns (address token_) {
        token_ = address(new IOUToken(msg.sender, _totalSupply, _name, _symbol));
        emit DeployedToken(token_, _totalSupply);
    }
}
