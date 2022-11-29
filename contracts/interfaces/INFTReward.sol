// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

interface INFTReward is IERC721Upgradeable {

    /**
     * @notice mint a NFT for _to address
     * @param _to address of user
     * @param _uri Token URi of NFT
     * 
     * emit { Minted } events
     */
    function mint(address _to, string memory _uri) external;

    /**
     * @notice Replace for contructor
     * @param _learnToEarn Address of LearnToEarn contract
     * @param _name Name of NFTs
     * @param _symbol Symbol of NFTs
     */
    function initialize(address _learnToEarn, string memory _name, string memory _symbol) external;
}