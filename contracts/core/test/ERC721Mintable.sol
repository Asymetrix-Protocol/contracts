// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @dev Extension of {ERC721Upgradeable} for Minting/Burning
 */
contract ERC721Mintable is ERC721Upgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        __ERC721_init_unchained("ERC 721", "NFT");
    }

    /**
     * @dev See {ERC721Upgradeable-_mint}.
     */
    function mint(address to, uint256 tokenId) public {
        _mint(to, tokenId);
    }

    /**
     * @dev See {ERC721Upgradeable-_burn}.
     */
    function burn(uint256 tokenId) public {
        _burn(tokenId);
    }
}
