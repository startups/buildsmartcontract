// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { Package } from "./Structs.sol";

library PackageLibrary {
    uint256 public constant MAX_COLLABORATORS = 10;
    uint256 public constant MAX_OBSERVERS = 10;

    /**
	@notice Throws if there is no package
	 */
    modifier onlyActivePackage(Package storage package_) {
        require(package_.isActive, "no such package");
        _;
    }

    /**
     * @notice Creates package in project
     * @param package_ reference to Package struct
     * @param budget_ MGP budget
     * @param feeObserversBudget_ Observers fee budget
     * @param bonus_ Bonus budget
     */
    function _createPackage(
        Package storage package_,
        uint256 budget_,
        uint256 feeObserversBudget_,
        uint256 bonus_,
        uint256 maxCollaborators_
    ) internal {
        require(0 < maxCollaborators_ && maxCollaborators_ <= MAX_COLLABORATORS, "incorrect max colalborators");
        package_.budget = budget_;
        package_.budgetObservers = feeObserversBudget_;
        package_.bonus = bonus_;
        package_.budgetAllocated = 0;
        package_.maxCollaborators = maxCollaborators_;
        package_.timeCreated = block.timestamp;
        package_.isActive = true;
    }

    /**
     * @notice Cancel package in project
     * @param package_ Package want to cancel
     */
    function _cancelPackage(Package storage package_) internal onlyActivePackage(package_) {
        package_.timeCanceled = block.timestamp;
        package_.isActive = false;
    }

    /**
     * @notice Adds observers to package
     * @param package_ reference to Package struct
     */
    function _addObserver(Package storage package_) internal onlyActivePackage(package_) {
        require(package_.totalObservers < MAX_OBSERVERS, "Max observers reached");
        package_.totalObservers++;
    }

    /**
     * @notice Removes observers from package
     * @param package_ reference to Package struct
     */
    function _removeObserver(Package storage package_) internal onlyActivePackage(package_) {
        package_.totalObservers--;
    }

    /**
     * @notice Allocate budget to collaborator and increase number of collaborators
     * @param amount_ amount to reserve
     */
    function _allocateBudget(Package storage package_, uint256 amount_) internal onlyActivePackage(package_) {
        require(package_.budget >= package_.budgetAllocated + amount_, "not enough package budget left");
        require(package_.totalCollaborators < package_.maxCollaborators, "Max collaborators reached");
        package_.budgetAllocated += amount_;
        package_.totalCollaborators++;
    }

    /**
     * @notice Increase number of approved Collaborator
     * @param package_ reference to Package struct
     */
    function _approveCollaborator(Package storage package_) internal onlyActivePackage(package_) {
        package_.approvedCollaborators++;
    }

    /**
     * @notice Remove collaborator from package
     * @param package_ Package want to cancel
     * @param mgp_ MGP to pay
     */
    function _removeCollaborator(
        Package storage package_,
        uint256 mgp_
    ) internal onlyActivePackage(package_) {
        package_.budgetAllocated -= mgp_;
        package_.totalCollaborators--;
    }

    /**
     * @notice Finishes package in project, checks if already finished, records time
     * if budget left and there is no collaborators, bonus is refunded to package budget
     * @param package_ reference to Package struct
     */
    function _finishPackage(Package storage package_) internal onlyActivePackage(package_) returns (uint256 budgetLeft_) {
        require(package_.totalCollaborators == package_.approvedCollaborators, "unapproved collaborators left");
        budgetLeft_ = package_.budget - package_.budgetAllocated;
        if (package_.totalObservers == 0) budgetLeft_ += package_.budgetObservers;
        if (package_.totalCollaborators == 0) budgetLeft_ += package_.bonus;
        package_.timeFinished = block.timestamp;
        package_.isActive = false;
        return budgetLeft_;
    }

    /**
     * @notice Get observer's claimable portion in package
     * @param package_ reference to Package struct
     */
    function _getObserverFee(Package storage package_) internal view returns (uint256) {
        uint256 remains = package_.budgetObservers - package_.budgetObserversPaid;
        //slither-disable-next-line divide-before-multiply
        uint256 portion = package_.budgetObservers / package_.totalObservers;
        return (remains < 2 * portion) ? remains : portion;
    }

    /**
     * @notice Increases package's observers budget paid
     * @param package_ reference to Package struct
     */
    function _claimObserverFee(Package storage package_, uint256 amount_) internal {
        package_.budgetObserversPaid += amount_;
    }

    /**
     * @notice Pay MGP to budget
     * @param package_ reference to Package struct
     * @param amount_ MGP amount
     */
    function _payMgp(Package storage package_, uint256 amount_) internal {
        package_.budgetPaid += amount_;
    }

    /**
     * @notice Pay Reward to budget
     * @param package_ reference to Package struct
     * @param mgp_ MGP amount
     * @param bonus_ Bonus amount
     */
    function _payReward(Package storage package_, uint256 mgp_, uint256 bonus_) internal {
        package_.budgetPaid += mgp_ + bonus_;
        package_.bonusPaid += bonus_;
        package_.collaboratorsPaidBonus++;
    }
}
