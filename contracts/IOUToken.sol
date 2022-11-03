// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 *  @title  IOUToken Contract
 *  @author ReBaked Team
 */
contract IOUToken is ERC20 {
    constructor(address reBakedDao_, uint256 totalSupply_) ERC20("IOU Token", "IOUT") {
        _mint(reBakedDao_, totalSupply_);
    }

    /**
     * @notice Burn owned token
     * @param amount_ Amount of token want to burn
     * Emit {Transfer}
     */
    function burn(uint256 amount_) external {
        _burn(_msgSender(), amount_);
    }
}
