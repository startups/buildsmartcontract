// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { IERC165Upgradeable, IERC721Upgradeable, ERC721Upgradeable, ERC721URIStorageUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import { INFTReward } from "./interfaces/INFTReward.sol";

/**
 *  @title  NFTReward Contract
 *  @author ReBaked Team
 */

contract NFTReward is ERC721URIStorageUpgradeable, INFTReward {
    event Minted(address account, uint256 tokenId, string uri);

    address public learnToEarn;
    uint256 private _tokenIds;

    /**
     * @notice Replace for contructor
     * @param _learnToEarn Address of LearnToEarn contract
     * @param _name Name of NFTs
     * @param _symbol Symbol of NFTs
     */
    function initialize(address _learnToEarn, string memory _name, string memory _symbol) initializer public {
        __ERC721_init(_name, _symbol);
        learnToEarn = _learnToEarn;
        _tokenIds = 0;
    }

    /**
     * @notice Override function `supportsInterface` when using ERC165
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165Upgradeable, ERC721Upgradeable) returns (bool) {
        return interfaceId == type(INFTReward).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @notice mint a NFT for _to address
     * @param _to address of user
     * @param _uri Token URi of NFT
     *
     * emit { Minted } events
     */
    function mint(address _to, string memory _uri) external {
        require(_msgSender() == learnToEarn, "Caller is not learnToEarn");
        ++_tokenIds;
        _safeMint(_to, _tokenIds);
        _setTokenURI(_tokenIds, _uri);

        emit Minted(_to, _tokenIds, _uri);
    }
}
