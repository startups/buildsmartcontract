// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ITokenFactory } from "./interfaces/ITokenFactory.sol";
import { IOUToken } from "./IOUToken.sol";

/**
 *  @title  TokenFactory Contract
 *  @author ReBaked Team
 *  @notice This contract using for creating IOU Token
 */
contract TokenFactory is OwnableUpgradeable, ITokenFactory {
    // Reference to Rebaked DAO contract
    address public reBakedDao;

    /**
     * @notice Initialize of contract (replace for constructor)
     */
    function initialize() public initializer {
        __Ownable_init();
    }

    /**
     * @notice Update RebakedDao contract address
     * @param _reBakedDao RebakedDao contract address
     * Emit {SetRebakedDao}
     */
    function setReBakedDao(address _reBakedDao) external onlyOwner {
        require(_reBakedDao != address(0), "reBakedDao address is not valid");
        address oldRebakedDao = reBakedDao;
        reBakedDao = _reBakedDao;
        emit SetRebakedDao(oldRebakedDao, reBakedDao);
    }

    /**
     * @notice Deploys IOUT with totalSupply equal to project budget
     * @param _totalSupply Token total supply
     * @return token_ IOU token address
     */
    function deployToken(uint256 _totalSupply, string memory _name, string memory _symbol) external returns (address token_) {
        require(reBakedDao != address(0), "reBakedDao address is not set");
        require(msg.sender == reBakedDao, "only reBakedDao can call");

        token_ = address(new IOUToken(reBakedDao, _totalSupply, _name, _symbol));
        emit DeployedToken(token_, _totalSupply);
    }
}
