// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;
import { Collaborator } from "./Structs.sol";

library CollaboratorLibrary {
    uint256 public constant DEFEND_REMOVAL_DURATION = 2 days;
    uint256 public constant RESOLVE_DISPUTE_DURATION = 3 days;

    /**
	@notice Throws if there is no such collaborator
	*/
    modifier onlyActiveCollaborator(Collaborator storage collaborator_) {
        require(collaborator_.timeCreated > 0 && !collaborator_.isRemoved, "no such collaborator");
        _;
    }

    /**
     * @notice Adds collaborator, checks for zero address and if already added, records mgp
     * @param collaborator_ reference to Collaborator struct
     * @param collaborator_ collaborator's address
     * @param mgp_ minimum guaranteed payment
     */
    function _addCollaborator(Collaborator storage collaborator_, uint256 mgp_) internal {
        require(collaborator_.isRemoved || collaborator_.timeCreated == 0, "collaborator already added");

        collaborator_.mgp = mgp_;
        collaborator_.isRemoved = false;
        collaborator_.timeCreated = block.timestamp;
    }

    /**
     * @notice Approves collaborator's MGP or deletes collaborator
     * @param collaborator_ reference to Collaborator struct
     */
    function _approveCollaborator(Collaborator storage collaborator_) internal onlyActiveCollaborator(collaborator_) {
        require(collaborator_.timeMgpApproved == 0, "collaborator already approved");
        collaborator_.timeMgpApproved = block.timestamp;
    }

    function _removeCollaborator(Collaborator storage collaborator_) internal onlyActiveCollaborator(collaborator_) {
        collaborator_.isRemoved = true;
        collaborator_.disputeExpiresAt = 0;
        collaborator_.resolveExpiresAt = 0;
    }

    /**
     * @notice Sets scores for collaborator bonuses
     * @param collaborator_ reference to Collaborator struct
     * @param bonusScore_ collaborator's bonus score
     */
    function _setBonusScore(Collaborator storage collaborator_, uint256 bonusScore_) internal onlyActiveCollaborator(collaborator_) {
        require(collaborator_.bonusScore == 0, "collaborator bonus already set");
        require(bonusScore_ > 0, "new bonus score is zero");
        collaborator_.bonusScore = bonusScore_;
    }

    /**
     * @notice request remove collaborator
     * @param collaborator_ collaborator
     */
    function _requestRemoval(Collaborator storage collaborator_) internal onlyActiveCollaborator(collaborator_) {
        require(collaborator_.disputeExpiresAt == 0, "already in dispute");
        require(collaborator_.timeMgpPaid == 0, "Already Claimed MGP");
        collaborator_.disputeExpiresAt = block.timestamp + DEFEND_REMOVAL_DURATION;
    }

    /**
     * @notice Contributor defend removal
     * @param collaborator_ collaborator
     */
    function _defendRemoval(Collaborator storage collaborator_) internal onlyActiveCollaborator(collaborator_) {
        require(collaborator_.resolveExpiresAt == 0, "already defended removal");
        require(block.timestamp <= collaborator_.disputeExpiresAt, "dispute period already expired");
        collaborator_.resolveExpiresAt = block.timestamp + RESOLVE_DISPUTE_DURATION;
    }

    /**
     * @notice Check if can settle expired disputed to collaborator
     * @param collaborator_ collaborator
     */
    function _canSettleExpiredDispute(Collaborator storage collaborator_) internal view returns (bool) {
        if (collaborator_.resolveExpiresAt > 0) {
            return collaborator_.resolveExpiresAt < block.timestamp;
        }

        return collaborator_.disputeExpiresAt > 0 && collaborator_.disputeExpiresAt < block.timestamp;
    }

    /**
     * @notice Sets MGP time paid flag, checks if approved and already paid
     * @param collaborator_ reference to Collaborator struct
     */
    function _claimMgp(Collaborator storage collaborator_) internal onlyActiveCollaborator(collaborator_) returns (uint256) {
        require(collaborator_.timeMgpApproved > 0, "mgp is not approved");
        require(collaborator_.timeMgpPaid == 0, "mgp already paid");
        collaborator_.timeMgpPaid = block.timestamp;
        return collaborator_.mgp;
    }

    /**
     * @notice Pay MGP to collaborator
     * @param collaborator_ collaborator
     */
    function _payMgp(Collaborator storage collaborator_) internal onlyActiveCollaborator(collaborator_) {
        require(collaborator_.timeMgpPaid == 0, "mgp already paid");
        collaborator_.timeMgpPaid = block.timestamp;
    }

    /**
     * @notice Sets Bonus time paid flag, checks is approved and already paid
     * @param collaborator_ reference to Collaborator struct
     */
    function _claimBonus(Collaborator storage collaborator_) internal onlyActiveCollaborator(collaborator_) {
        require(collaborator_.bonusScore > 0, "bonus score is zero");
        require(collaborator_.timeBonusPaid == 0, "bonus already paid");
        collaborator_.timeBonusPaid = block.timestamp;
    }
}
