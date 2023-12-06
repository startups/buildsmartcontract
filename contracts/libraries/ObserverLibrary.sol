// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { Observer } from "./Structs.sol";

library ObserverLibrary {
    /**
	@notice Throws if there is no such observer
	 */
    modifier onlyActiveObserver(Observer storage observer_) {
        require(observer_.timeCreated > 0 && !observer_.isRemoved, "no such observer");
        _;
    }

    /**
     * @notice Add observer to package
     * @param _observer Observer address
     */
    function _addObserver(Observer storage _observer) internal {
        require(_observer.timeCreated == 0, "observer already added");
        _observer.timeCreated = block.timestamp;
    }

    /**
     * @notice Remove observer from package
     * @param _observer Observer address
     */
    function _removeObserver(Observer storage _observer) internal onlyActiveObserver(_observer) {
        _observer.isRemoved = true;
    }

    /**
     * @notice Observer claim fee
     * @param _observer Observer address
     */
    function _payObserverFee(Observer storage _observer) internal onlyActiveObserver(_observer) {
        require(_observer.timePaid == 0, "observer fee already paid");
        _observer.timePaid = block.timestamp;
    }
}
