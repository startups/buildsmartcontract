// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 *  @title  IOUToken Contract
 *  @author ReBaked Team
 */
contract IOUToken is ERC20 {
    constructor(address reBakedDao_, uint256 totalSupply_, string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _mint(reBakedDao_, totalSupply_);
    }
}
