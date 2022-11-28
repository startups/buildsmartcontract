// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

interface INFTReward {

    /**
     * @notice mint a NFT for _to address
     * @param _to address of user
     * 
     * emit { Minted } events
     */
    function mint(address _to) external;
}