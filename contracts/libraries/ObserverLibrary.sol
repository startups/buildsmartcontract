// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import { Observer } from "./Structs.sol";

library ObserverLibrary {

    /**
	@dev Throws if there is no such observer
	 */
    modifier onlyExistingObserver(Observer storage observer_) {
        require(observer_.timeCreated > 0, "no such observer");
        _;
    }

    function _addObserver(Observer storage _observer) internal {
        require(_observer.timeCreated == 0, "observer already added");
        _observer.timeCreated = block.timestamp;
        _observer.isRemoved = false;
    }

    function _removeObserver(Observer storage _observer) internal onlyExistingObserver(_observer) {
        _observer.timeCreated = 0;
        _observer.isRemoved = true;
    }

    function _claimObserverFee(Observer storage _observer) internal onlyExistingObserver(_observer) {
        require(_observer.timePaid == 0, "observer already paid");
        _observer.timePaid = block.timestamp;
    }
}
