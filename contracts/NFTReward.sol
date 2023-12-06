// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { IERC165Upgradeable, IERC721Upgradeable, ERC721Upgradeable, ERC721URIStorageUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import { INFTReward } from "./interfaces/INFTReward.sol";

/**
 *  @title  NFTReward Contract
 *  @author ReBaked Team
 */

contract NFTReward is ERC721URIStorageUpgradeable, INFTReward {
    /**
     * @notice Address of LearnToEarn contract
     */
    address public learnToEarn;

    /**
     * @notice ID of Minted NFT, increase by 1
     */
    uint256 public tokenIds;

    /**
     * notice URI of NFT, NFTs in same contract has the same URI
     */
    string public uri;

    /* -----------INITILIZER----------- */

    /**
     * @notice Replace for contructor
     * @param _learnToEarn Address of LearnToEarn contract
     * @param _name Name of NFTs
     * @param _symbol Symbol of NFTs
     * @param _uri ipfs of NFTs
     */
    function initialize(address _learnToEarn, string memory _name, string memory _symbol, string memory _uri) public initializer {
        require(_learnToEarn != address(0), "LearnToEarn address is not valid");
        __ERC721_init(_name, _symbol);

        learnToEarn = _learnToEarn;
        uri = _uri;
    }

    /* -----------EXTERNAL FUNCTIONS----------- */

    /**
     * @notice mint a NFT for _to address
     * @param _to address of user
     *
     * emit { Minted } events
     */
    function mint(address _to) external returns(uint256) {
        require(_msgSender() == learnToEarn, "Caller is not learnToEarn");
        ++tokenIds;
        _safeMint(_to, tokenIds);
        _setTokenURI(tokenIds, uri);

        emit Minted(_to, tokenIds, uri);
        return tokenIds;
    }

    /* -----------VIEW FUNCTIONS----------- */

    /**
     * @notice Override function `supportsInterface` when using ERC165
     * @dev Returns true if this contract implements the interface defined by `interfaceId`.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165Upgradeable, ERC721Upgradeable) returns (bool) {
        return interfaceId == type(INFTReward).interfaceId || super.supportsInterface(interfaceId);
    }
}
