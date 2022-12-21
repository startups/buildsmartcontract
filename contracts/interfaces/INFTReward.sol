// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

interface INFTReward is IERC721Upgradeable {
    event Minted(address account, uint256 tokenId, string uri);

    /**
     * @notice mint a NFT for _to address
     * @param _to address of user
     * 
     * emit { Minted } events
     */
    function mint(address _to) external returns(uint256);

    /**
     * @notice Replace for contructor
     * @param _learnToEarn Address of LearnToEarn contract
     * @param _name Name of NFTs
     * @param _symbol Symbol of NFTs
     * @param _uri ipfs of NFts
     */
    function initialize(address _learnToEarn, string memory _name, string memory _symbol, string memory _uri) external;
}