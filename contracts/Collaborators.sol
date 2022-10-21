// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import {Collaborator, CollaboratorLibrary} from "./libraries/CollaboratorLibrary.sol";

contract Collaborators {
    using CollaboratorLibrary for Collaborator;

    mapping(bytes32 => mapping(bytes32 => mapping(address => Collaborator)))
        internal collaboratorData;

    /**
     * @dev Adds collaborator
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param collaborator_ collaborator's address
     * @param mgp_ minimum guaranteed payment
     */
    function _addCollaborator(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_,
        uint256 mgp_
    ) internal {
        require(collaborator_ != address(0), "collaborator's address is zero");
        collaboratorData[projectId_][packageId_][collaborator_]
            ._addCollaborator(mgp_);
    }

    function _removeCollaboratorByInitiator(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_
    ) internal {
        require(collaborator_ != address(0), "collaborator's address is zero");
        collaboratorData[projectId_][packageId_][collaborator_]
            ._removeCollaboratorByInitiator();
    }

    function _selfWithdraw(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_
    ) internal {
        require(collaborator_ != address(0), "collaborator's address is zero");
        collaboratorData[projectId_][packageId_][collaborator_]._selfWithdraw();
    }

    /**
     * @dev Approves collaborator's MGP or deletes collaborator
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param collaborator_ collaborator's address
     * @param approve_ whether to approve or not collaborator payment
     */
    function _approveCollaborator(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_,
        bool approve_
    ) internal virtual returns (uint256 mgp_) {
        mgp_ = collaboratorData[projectId_][packageId_][collaborator_].mgp;
        collaboratorData[projectId_][packageId_][collaborator_]
            ._approveCollaborator(approve_);
        if (!approve_)
            delete collaboratorData[projectId_][packageId_][collaborator_];
    }

    /**
     * @dev Sets scores for collaborator bonuses
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param collaborator_ collaborator's address
     * @param bonusScore_ collaborator's bonus score
     */
    function _setBonusScore(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_,
        uint256 bonusScore_
    ) internal {
        collaboratorData[projectId_][packageId_][collaborator_]._setBonusScore(
            bonusScore_
        );
    }

    /**
     * @dev Sets MGP time paid flag
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     */
    function _getMgp(bytes32 projectId_, bytes32 packageId_)
        internal
        virtual
        returns (uint256)
    {
        return collaboratorData[projectId_][packageId_][msg.sender]._getMgp();
    }

    /**
     * @dev Sets MGP time paid flag for dispute resolved collabotator
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     */

    function _getMgpForApprovedPayment(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_
    ) internal virtual returns (uint256) {
        return
            collaboratorData[projectId_][packageId_][collaborator_]
                ._getMgpForApproved();
    }

    /**
     * @dev Sets Bonus time paid flag
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     */
    function _paidBonus(bytes32 projectId_, bytes32 packageId_) internal {
        collaboratorData[projectId_][packageId_][msg.sender]._claimBonus();
    }

    /**
     * @dev Sets Bonus time paid flag for dispute resolved collaborator
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     */

    function _paidBonusForApprovedPayment(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_
    ) internal {
        collaboratorData[projectId_][packageId_][collaborator_]
            ._paidBonusForApproved();
    }

    /**
     * @dev Returns collaborator data for given project id, package id and address.
     * @param projectId_ project ID
     * @param packageId_ package ID
     * @param collaborator_ collaborator's address
     * @return collaboratorData_
     */
    function getCollaboratorData(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_
    ) external view returns (Collaborator memory) {
        return collaboratorData[projectId_][packageId_][collaborator_];
    }
}
