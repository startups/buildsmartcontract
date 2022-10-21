// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import {Collaborator} from "./Structs.sol";

library CollaboratorLibrary {
    /**
	@dev Throws if there is no such collaborator
	*/
    modifier onlyExistingCollaborator(Collaborator storage collaborator_) {
        require(collaborator_.mgp != 0, "no such collaborator");
        _;
    }

    /**
     * @dev Adds collaborator, checks for zero address and if already added, records mgp
     * @param collaborator_ reference to Collaborator struct
     * @param collaborator_ collaborator's address
     * @param mgp_ minimum guaranteed payment
     */
    function _addCollaborator(Collaborator storage collaborator_, uint256 mgp_)
        internal
    {
        require(
            collaborator_.timeMgpPaid == 0 || collaborator_.isMGPPaid == false,
            "collaborator already added"
        );
        collaborator_.mgp = mgp_;
    }

    function _removeCollaboratorByInitiator(Collaborator storage collaborator_)
        internal
    {
        collaborator_.isRemoved == true;
        collaborator_.bonusScore = 0;
    }

    function _selfWithdraw(Collaborator storage collaborator_) internal {
        collaborator_.isRemoved == true;
        collaborator_.bonusScore = 0;
        collaborator_.timeMgpApproved = 0;
        collaborator_.mgp = 0;
        collaborator_.approvedMGPForDispute = false;
        collaborator_.approvedBonusForDispute = false;
    }

    /**
     * @dev Approves collaborator's MGP or deletes collaborator
     * @param collaborator_ reference to Collaborator struct
     * @param approve_ whether to approve or not collaborator payment
     */
    function _approveCollaborator(
        Collaborator storage collaborator_,
        bool approve_
    ) internal onlyExistingCollaborator(collaborator_) {
        require(
            collaborator_.timeMgpApproved == 0 ||
                collaborator_.isMGPPaid == false,
            "already approved collaborator mgp"
        );
        if (approve_) {
            collaborator_.timeMgpApproved = block.timestamp;
            collaborator_.isRemoved = false;
        }
    }

    /**
     * @dev Sets scores for collaborator bonuses
     * @param collaborator_ reference to Collaborator struct
     * @param bonusScore_ collaborator's bonus score
     */
    function _setBonusScore(
        Collaborator storage collaborator_,
        uint256 bonusScore_
    ) internal onlyExistingCollaborator(collaborator_) {
        require(
            collaborator_.bonusScore == 0 || collaborator_.isMGPPaid == false,
            "collaborator bonus score already set"
        );
        collaborator_.bonusScore = bonusScore_;
    }

    /**
     * @dev Raise Dispute
     * @param collaborator_ paid amount
     */
    function _raiseDispute(Collaborator storage collaborator_)
        internal onlyExistingCollaborator(collaborator_)
    {
        collaborator_.isDisputeRaised = true;
    }

    /**
     * @dev Resolve Dispute
     * @param collaborator_ paid amount
     */
    function _resolveDispute(
        Collaborator storage collaborator_,
        bool approved
    )
        internal onlyExistingCollaborator(collaborator_)
    {
        collaborator_.isDisputeRaised = false;
        if (!approved) {
            collaborator_.mgp = 0;
            collaborator_.bonusScore = 0;
        }
    }

    /**
     * @dev Sets MGP time paid flag, checks if approved and already paid
     * @param collaborator_ reference to Collaborator struct
     */
    function _getMgp(Collaborator storage collaborator_)
        internal
        onlyExistingCollaborator(collaborator_)
        returns (uint256)
    {
        require(collaborator_.timeMgpApproved != 0, "mgp is not approved");
        require(collaborator_.timeMgpPaid == 0, "mgp already paid");
        collaborator_.timeMgpPaid = block.timestamp;
        collaborator_.isMGPPaid = true;
        return collaborator_.mgp;
    }

    /**
     * @dev Sets MGP time paid flag for dispute resolved collaborator, Sets approved MGP for disputed collaborator, checks if approved after resolve dispute or already paid
     * @param collaborator_ reference to Collaborator struct
     */

    function _getMgpForApproved(Collaborator storage collaborator_)
        internal
        onlyExistingCollaborator(collaborator_)
        returns (uint256)
    {
        require(
            collaborator_.approvedMGPForDispute == false ||
                collaborator_.isMGPPaid == false,
            "mgp already approved"
        );
        collaborator_.approvedMGPForDispute = true;
        return collaborator_.mgp;
    }

    /**
     * @dev Sets Bonus time paid flag, checks is approved and already paid
     * @param collaborator_ reference to Collaborator struct
     */
    function _claimBonus(Collaborator storage collaborator_)
        internal
        onlyExistingCollaborator(collaborator_)
    {
        require(collaborator_.bonusScore != 0, "bonus score is zero");
        require(collaborator_.timeBonusPaid == 0, "bonus already paid");
        collaborator_.timeBonusPaid = block.timestamp;
        collaborator_.isBonusPaid = true;
    }

    /**
     * @dev Sets Bonus time paid flag, sets approved bonus for disputed collaborator, checks is approved or not paid
     * @param collaborator_ reference to Collaborator struct
     */

    function _paidBonusForApproved(Collaborator storage collaborator_)
        internal
        onlyExistingCollaborator(collaborator_)
    {
        require(
            collaborator_.approvedBonusForDispute == false ||
                collaborator_.isBonusPaid == false,
            "bonus already approved"
        );
        collaborator_.approvedBonusForDispute = true;
    }
}
