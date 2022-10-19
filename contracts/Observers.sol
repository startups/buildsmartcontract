// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import { Observer} from "./libraries/Structs.sol";


contract Observers {

	mapping(bytes32 => mapping(bytes32 => mapping(address => Observer))) internal observerData;

	/**
	* @dev Checks if observer can be added and records time
	* @param projectId_ Id of the project
	* @param packageId_ Id of the package
	* @param observer_ observer addresses
	*/
	function _addObserver(
		bytes32 projectId_,
		bytes32 packageId_,
		address observer_
	)
		internal
	{
		require(observer_ != address(0), "observer address is zero");
		Observer storage _observer = observerData[projectId_][packageId_][observer_];
		require(_observer.timeCreated == 0 || _observer.isFeePaid == false, "observer already added");
		_observer.timeCreated = block.timestamp;
		_observer.isRemoved = false;
	}

	/**
	* @dev Marks observer fee paid, checks if observer can be paid and records time
	* @param projectId_ Id of the project  
	* @param packageId_ Id of the package
	*/
	function _paidObserverFee(
		bytes32 projectId_,
		bytes32 packageId_
	)
		internal
		returns(uint256)
	{
		Observer storage _observer = observerData[projectId_][packageId_][msg.sender];
		require(_observer.timeCreated != 0, "no such observer");
		require(_observer.timePaid == 0, "observer already paid");
		_observer.timePaid = block.timestamp;
		_observer.isFeePaid = true;
		return 0;
	}

	/**
	* @dev Returns observer data for project id and address.
	* @param projectId_ project ID
	* @param packageId_ Id of the package
	* @param observer_ observer's address
	* @return observerData_
	*/
	function getObserverData(bytes32 projectId_, bytes32 packageId_, address observer_)
		external
		view
		returns(Observer memory)
	{
		return observerData[projectId_][packageId_][observer_];
	}

}