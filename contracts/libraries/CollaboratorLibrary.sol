// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import { Collaborator } from "./Structs.sol";

library CollaboratorLibrary {
    /**
	@dev Throws if there is no such collaborator
	*/
    modifier onlyExistingCollaborator(Collaborator storage collaborator_) {
        require(collaborator_.mgp > 0, "no such collaborator");
        _;
    }

    /**
     * @dev Adds collaborator, checks for zero address and if already added, records mgp
     * @param collaborator_ reference to Collaborator struct
     * @param collaborator_ collaborator's address
     * @param mgp_ minimum guaranteed payment
     */
    function _addCollaborator(Collaborator storage collaborator_, uint256 mgp_) internal {
        require(collaborator_.mgp == 0, "collaborator already added");
        collaborator_.mgp = mgp_;
    }

    function _removeCollaboratorByInitiator(Collaborator storage collaborator_) internal onlyExistingCollaborator(collaborator_) {
        collaborator_.isRemoved = true;
        collaborator_.bonusScore = 0;
    }

    function _selfWithdraw(Collaborator storage collaborator_) internal onlyExistingCollaborator(collaborator_) {
        collaborator_.isRemoved = true;
        collaborator_.mgp = 0;
        collaborator_.bonusScore = 0;
        collaborator_.timeMgpApproved = 0;
    }

    /**
     * @dev Approves collaborator's MGP or deletes collaborator
     * @param collaborator_ reference to Collaborator struct
     */
    function _approveCollaborator(Collaborator storage collaborator_) internal onlyExistingCollaborator(collaborator_) {
        require(collaborator_.timeMgpApproved == 0, "collaborator already approved");
        collaborator_.timeMgpApproved = block.timestamp;
        collaborator_.isRemoved = false;
    }

    /**
     * @dev Sets scores for collaborator bonuses
     * @param collaborator_ reference to Collaborator struct
     * @param bonusScore_ collaborator's bonus score
     */
    function _setBonusScore(Collaborator storage collaborator_, uint256 bonusScore_) internal onlyExistingCollaborator(collaborator_) {
        require(collaborator_.bonusScore == 0, "collaborator bonus already set");
        collaborator_.bonusScore = bonusScore_;
    }

    /**
     * @dev Raise Dispute
     * @param collaborator_ paid amount
     */
    function _raiseDispute(Collaborator storage collaborator_) internal onlyExistingCollaborator(collaborator_) {
        require(!collaborator_.isInDispute, "Collaborator already in dispute");
        require(collaborator_.timeMgpPaid == 0, "Already Claimed MGP");
        require(collaborator_.timeBonusPaid == 0, "Already Claimed Bonus");
        collaborator_.isInDispute = true;
    }

    /**
     * @dev Resolve Dispute
     * @param collaborator_ paid amount
     */
    function _resolveDispute(Collaborator storage collaborator_, bool approved) internal onlyExistingCollaborator(collaborator_) {
        require(collaborator_.isInDispute, "Dispute Required");
        collaborator_.isInDispute = false;
        if (!approved) {
            collaborator_.mgp = 0;
            collaborator_.bonusScore = 0;
        }
    }

    /**
     * @dev Sets MGP time paid flag, checks if approved and already paid
     * @param collaborator_ reference to Collaborator struct
     */
    function _claimMgp(Collaborator storage collaborator_) internal onlyExistingCollaborator(collaborator_) returns (uint256) {
        require(!collaborator_.isInDispute, "Collaborator still in dispute");
        require(collaborator_.timeMgpApproved > 0, "mgp is not approved");
        require(collaborator_.timeMgpPaid == 0, "mgp already paid");
        collaborator_.timeMgpPaid = block.timestamp;
        return collaborator_.mgp;
    }

    function _payMgp(Collaborator storage collaborator_) internal onlyExistingCollaborator(collaborator_) returns (uint256) {
        require(collaborator_.timeMgpPaid == 0, "mgp already paid");
        collaborator_.timeMgpPaid = block.timestamp;
        return collaborator_.mgp;
    }

    /**
     * @dev Sets Bonus time paid flag, checks is approved and already paid
     * @param collaborator_ reference to Collaborator struct
     */
    function _claimBonus(Collaborator storage collaborator_) internal onlyExistingCollaborator(collaborator_) {
        require(!collaborator_.isInDispute, "Collaborator still in dispute");
        require(collaborator_.bonusScore > 0, "bonus score is zero");
        require(collaborator_.timeBonusPaid == 0, "bonus already paid");
        collaborator_.timeBonusPaid = block.timestamp;
    }
}
