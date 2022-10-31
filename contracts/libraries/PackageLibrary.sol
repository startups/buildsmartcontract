// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import { Package } from "./Structs.sol";

library PackageLibrary {
    uint256 public constant MIN_COLLABORATORS = 3;
    uint256 public constant MAX_COLLABORATORS = 10;
    uint256 public constant MAX_OBSERVERS = 10;

    /**
	@dev Throws if there is no package
	 */
    modifier onlyActivePackage(Package storage package_) {
        require(package_.timeCreated > 0, "no such package");
        _;
    }

    modifier activePackage(Package storage package_) {
        require(package_.isActive, "already canceled!");
        _;
    }

    /**
     * @dev Creates package in project
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
        require(MIN_COLLABORATORS <= maxCollaborators_ && maxCollaborators_ <= MAX_COLLABORATORS, "incorrect max colalborators");
        package_.budget = budget_;
        package_.budgetObservers = feeObserversBudget_;
        package_.bonus = bonus_;
        package_.budgetAllocated = 0;
        package_.maxCollaborators = maxCollaborators_;
        package_.timeCreated = block.timestamp;
        package_.isActive = true;
    }

    function _cancelPackage(Package storage package_) internal onlyActivePackage(package_) activePackage(package_) {
        require(package_.timeFinished == 0, "already finished package");
        package_.timeCanceled = block.timestamp;
        package_.isActive = false;
    }

    /**
     * @dev Adds observers to package
     * @param package_ reference to Package struct
     */
    function _addObserver(Package storage package_) internal onlyActivePackage(package_) activePackage(package_) {
        require(package_.timeFinished == 0, "already finished package");
        require(package_.totalObservers < MAX_OBSERVERS, "Max observers reached");
        package_.totalObservers++;
    }

    /**
     * @dev Removes observers from package
     * @param package_ reference to Package struct
     */
    function _removeObserver(Package storage package_) internal onlyActivePackage(package_) activePackage(package_) {
        require(package_.timeFinished == 0, "already finished package");
        package_.totalObservers--;
    }

    /**
     * @dev Allocate budget to collaborator and increase number of collaborators
     * @param amount_ amount to reserve
     */
    function _allocateBudget(Package storage package_, uint256 amount_) internal onlyActivePackage(package_) activePackage(package_) {
        require(package_.timeFinished == 0, "already finished package");
        require(package_.budget >= package_.budgetAllocated + amount_, "not enough package budget left");
        require(package_.totalCollaborators < package_.maxCollaborators, "Max collaborators reached");
        package_.budgetAllocated += amount_;
        package_.totalCollaborators++;
    }

    /**
     * @dev Increase number of approved Collaborator
     * @param package_ reference to Package struct
     */
    function _approveCollaborator(Package storage package_) internal onlyActivePackage(package_) activePackage(package_) {
        package_.approvedCollaborators++;
    }

    function _removeCollaborator(
        Package storage package_,
        uint256 mgp_,
        bool inDispute_
    ) internal onlyActivePackage(package_) activePackage(package_) {
        require(package_.timeFinished == 0, "already finished package");
        package_.budgetAllocated -= mgp_;
        package_.totalCollaborators--;

        if (inDispute_) package_.disputesCount--;
    }

    /**
     * @dev Finishes package in project, checks if already finished, records time
     * if budget left and there is no collaborators, bonus is refunded to package budget
     * @param package_ reference to Package struct
     */
    function _finishPackage(Package storage package_) internal onlyActivePackage(package_) activePackage(package_) returns (uint256 budgetLeft_) {
        require(package_.timeFinished == 0, "already finished package");
        require(package_.disputesCount == 0, "package has unresolved disputes");
        require(package_.totalCollaborators == package_.approvedCollaborators, "unapproved collaborators left");
        budgetLeft_ = package_.budget - package_.budgetAllocated;
        if (package_.totalObservers == 0) budgetLeft_ += package_.budgetObservers;
        if (package_.totalCollaborators == 0) budgetLeft_ += package_.bonus;
        package_.timeFinished = block.timestamp;
        return budgetLeft_;
    }

    /**
     * @dev Sets scores for collaborator bonuses
     * @param package_ reference to Package struct
     * @param collaboratorsGetBonus_ max bonus scores (PPM)
     */
    function _setBonusScores(Package storage package_, uint256 collaboratorsGetBonus_) internal onlyActivePackage(package_) activePackage(package_) {
        require(package_.bonus > 0, "zero bonus budget");
        require(package_.timeFinished > 0, "package is not finished");
        package_.collaboratorsGetBonus = collaboratorsGetBonus_;
    }

    /**
     * @dev Get observer's claimable portion in package
     * @param package_ reference to Package struct
     */
    function _getObserverFee(Package storage package_) internal view onlyActivePackage(package_) returns (uint256) {
        if (package_.totalObservers == 0) return 0;
        if (package_.budgetObservers == package_.budgetObserversPaid) return 0;
        uint256 remains = package_.budgetObservers - package_.budgetObserversPaid;
        uint256 portion = package_.budgetObservers / package_.totalObservers;
        return (remains < 2 * portion) ? remains : portion;
    }

    /**
     * @dev Increases package's observers budget paid
     * @param package_ reference to Package struct
     */
    function _claimObserverFee(Package storage package_, uint256 amount_) internal {
        require(package_.timeFinished > 0 || package_.timeCanceled > 0, "package is not finished/canceled");
        package_.budgetObserversPaid += amount_;
    }

    /**
     * @dev Increases package budget paid
     * @param package_ reference to Package struct
     * @param amount_ MGP amount
     */
    function _claimMgp(Package storage package_, uint256 amount_) internal onlyActivePackage(package_) {
        require(package_.timeFinished > 0, "package not finished/canceled");
        package_.budgetPaid += amount_;
    }

    function _payMgp(Package storage package_, uint256 amount_) internal onlyActivePackage(package_) {
        package_.budgetPaid += amount_;
    }

    /**
     * @dev Increases package bonus paid
     * @param package_ reference to Package struct
     * @param amount_ Bonus amount
     */
    function _claimBonus(Package storage package_, uint256 amount_) internal onlyActivePackage(package_) activePackage(package_) {
        require(package_.timeFinished > 0, "package not finished");
        require(package_.bonus > 0, "package has no bonus");
        package_.bonusPaid += amount_;
        package_.collaboratorsPaidBonus++;
    }
}
