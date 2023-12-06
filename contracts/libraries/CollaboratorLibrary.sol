// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { Collaborator } from "./Structs.sol";

library CollaboratorLibrary {
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
    }

    /**
     * @notice Pay Reward to collaborator
     * @param collaborator_ collaborator
     * @param bonus_ bonus of collaborator
     */
    function _payReward(Collaborator storage collaborator_, uint256 bonus_) internal onlyActiveCollaborator(collaborator_) {
        require(collaborator_.timeMgpPaid == 0, "reward already paid");
        collaborator_.timeMgpPaid = block.timestamp;
        if (bonus_ > 0) {
            collaborator_.bonus = bonus_;
            collaborator_.timeBonusPaid = block.timestamp;
        }
    }
}
