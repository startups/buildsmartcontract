// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import {Package, PackageLibrary} from "./libraries/PackageLibrary.sol";
import {Observers} from "./Observers.sol";
import {Collaborators} from "./Collaborators.sol";

contract Packages is Observers, Collaborators {
    using PackageLibrary for Package;

    mapping(bytes32 => mapping(bytes32 => Package)) internal packageData;

    // address of approved collaborator with perticular package
    mapping(bytes32 => mapping(address => bool)) internal approvedUser;

    // Boolean to know if there is a dispute against a paticular collaborator in a particular package
    mapping(address => mapping(bytes32 => bool)) isDispute;

    /**
     * @dev Creates package
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param budget_ MGP budget
     * @param feeObserversBudget_ Observers fee budget
     * @param bonus_ Bonus budget
     */
    function _createPackage(
        bytes32 projectId_,
        bytes32 packageId_,
        uint256 budget_,
        uint256 feeObserversBudget_,
        uint256 bonus_
    ) internal virtual {
        packageData[projectId_][packageId_]._createPackage(
            budget_,
            feeObserversBudget_,
            bonus_
        );
    }

    function _cancelPackage(bytes32 projectId_, bytes32 packageId_) internal {
        packageData[projectId_][packageId_]._cancelPackage();
    }

    /**
     * @dev Adds observers to package
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param count_ number of observers
     */
    function _addObservers(
        bytes32 projectId_,
        bytes32 packageId_,
        uint256 count_
    ) internal {
        packageData[projectId_][packageId_]._addObservers(count_);
    }

    /**
     * @dev Reserves collaborators MGP from package budget and increase total number of collaborators
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param count_ number of collaborators to add
     * @param amount_ amount to reserve
     */
    function _reserveCollaboratorsBudget(
        bytes32 projectId_,
        bytes32 packageId_,
        uint256 count_,
        uint256 amount_
    ) internal {
        packageData[projectId_][packageId_]._reserveCollaboratorsBudget(
            count_,
            amount_
        );
    }

    /**
     * @dev Refund package budget and decreace total collaborators if not approved
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param collaborator_ address of collaborator
     * @param approve_ - whether to approve or not collaborator payment
     */
    function _approveCollaborator(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_,
        bool approve_
    ) internal virtual override returns (uint256 mgp_) {
        mgp_ = super._approveCollaborator(
            projectId_,
            packageId_,
            collaborator_,
            approve_
        );
        packageData[projectId_][packageId_]._approveCollaborator(
            approve_,
            mgp_
        );
        if (approve_) approvedUser[packageId_][collaborator_] = true;
    }

    /**
     * @dev Finishes package
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     */
    function _finishPackage(bytes32 projectId_, bytes32 packageId_)
        internal
        virtual
        returns (uint256)
    {
        return packageData[projectId_][packageId_]._finishPackage();
    }

    /**
     * @dev Sets allocated bonuses
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param totalBonusScores_ total sum of bonus scores
     * @param maxBonusScores_ max bonus scores (PPM)
     */
    function _setBonusScores(
        bytes32 projectId_,
        bytes32 packageId_,
        uint256 totalBonusScores_,
        uint256 maxBonusScores_
    ) internal {
        packageData[projectId_][packageId_]._setBonusScores(
            totalBonusScores_,
            maxBonusScores_
        );
    }

    /**
     * @dev Calls _getObserverFee in Observers and _getObserverFee in Observers Library
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @return amount_ fee amount paid
     */
    function _getObserverFee(bytes32 projectId_, bytes32 packageId_)
        internal
        returns (uint256)
    {
        return packageData[projectId_][packageId_]._getObserverFee();
    }

    /**
     * @dev Increases package budget paid
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param amount_ mgp amount
     */
    function _getMgp(bytes32 projectId_, bytes32 packageId_)
        internal
        virtual
        override
        returns (uint256 amount_)
    {
        amount_ = super._getMgp(projectId_, packageId_);
        packageData[projectId_][packageId_]._getMgp(amount_);
    }

    /**
     * @dev Increases package bonus paid
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param amount_ paid amount
     */
    function _paidBonus(
        bytes32 projectId_,
        bytes32 packageId_,
        uint256 amount_
    ) internal {
        packageData[projectId_][packageId_]._paidBonus(amount_);
        super._paidBonus(projectId_, packageId_);
    }

    /**
     * @dev Increases package bonus paid for dispute resolved collaborator
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param amount_ paid amount
     */

    function _paidBonusForDisputedCollaborator(
        bytes32 projectId_,
        bytes32 packageId_,
        uint256 amount_
    ) internal {
        packageData[projectId_][packageId_]._paidBonus(amount_);
        super._paidBonusForApprovedPayment(projectId_, packageId_, msg.sender);
    }

    /**
     * @dev Raise Dispute
     * @param packageId_ Id of the package
     * @param collaborator_ paid amount
     */

    function _raiseDispute(bytes32 packageId_, address collaborator_) internal {
        require(isDispute[collaborator_][packageId_] == false);
        isDispute[collaborator_][packageId_] = true;
    }

    /**
     * @dev Resolve Dispute
     * @param packageId_ Id of the package
     * @param collaborator_ paid amount
     */

    function _downDispute(bytes32 packageId_, address collaborator_) internal {
        isDispute[collaborator_][packageId_] = false;
    }

    /**
     * @dev Returns package data for given project id and package id.
     * @param projectId_ project ID
     * @param packageId_ package ID
     * @return packageData_
     */
    function getPackageData(bytes32 projectId_, bytes32 packageId_)
        external
        view
        returns (Package memory)
    {
        return (packageData[projectId_][packageId_]);
    }
}
