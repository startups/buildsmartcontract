// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IOUToken } from "./IOUToken.sol";

contract TokenFactory is Ownable {
	address public reBakedDao;

	event DeployedToken(address indexed token, uint256 indexed totalSupply);

	function setReBakedDao(address reBakedDao_)
		external
		onlyOwner
	{
		reBakedDao = reBakedDao_;
	}

/**
* @dev Deploys IOUT with totalSupply equal to project budget 
* @return token_ interface
*/
	function deployToken(uint256 totalSupply_)
		external
		returns (address token_)
	{
		require(reBakedDao != address(0), "reBakedDao address is not set");
		require(msg.sender == reBakedDao, "can be called only from reBakedDao contract");
		token_ =  address(new IOUToken(reBakedDao, totalSupply_));
		emit DeployedToken(token_, totalSupply_);
	}

}