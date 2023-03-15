// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MyContract {
    uint256 public x;
    
    function setX(uint256 _x) public {
        x = _x;
    }
}

import "github.com/crytic/echidna/blob/master/contracts/echidna.sol";

contract TestMyContract {
    using Echidna for Echidna.Test;

    MyContract public myContract;

    function setUp() public {
        myContract = new MyContract();
    }

    function test_setX() public {
        Echidna.Test memory test = myContract.echidna_test();

        // Ensure x is correctly set
        test.call(myContract.setX(1));
        Echidna.assert(test, myContract.x() == 1);

        // Ensure x is correctly updated
        test.call(myContract.setX(2));
        Echidna.assert(test, myContract.x() == 2);
    }
}