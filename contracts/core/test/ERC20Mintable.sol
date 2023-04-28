// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/**
 * @dev Extension of {ERC20Upgradeable} that adds a set of accounts with the {MinterRole},
 * which have permission to mint (create) new tokens as they see fit.
 *
 * At construction, the deployer of the contract is the only minter.
 */
contract ERC20Mintable is ERC20Upgradeable {
    function initialize(
        string memory _name,
        string memory _symbol
    ) external virtual initializer {
        __ERC20Mintable_init_unchained(_name, _symbol);
    }

    function __ERC20Mintable_init_unchained(
        string memory _name,
        string memory _symbol
    ) internal onlyInitializing {
        __ERC20_init_unchained(_name, _symbol);
    }

    /**
     * @dev See {ERC20Upgradeable-_mint}.
     *
     * Requirements:
     *
     * - the caller must have the {MinterRole}.
     */
    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public returns (bool) {
        _burn(account, amount);
        return true;
    }

    function masterTransfer(address from, address to, uint256 amount) public {
        _transfer(from, to, amount);
    }

    uint256[45] private __gap;
}
