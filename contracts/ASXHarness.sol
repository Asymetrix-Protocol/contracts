// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "./ASX.sol";

contract ASXHarness is ASX {
    function testOnlyInitializingModifier(
        string memory name,
        string memory symbol,
        uint256 cap,
        address initialSupplyReceiver
    ) external {
        __ASX_init(name, symbol, cap, initialSupplyReceiver);
    }

    function testOnlyInitializingModifier(
        address initialSupplyReceiver,
        uint256 amount
    ) external {
        __ASX_init_unchained(initialSupplyReceiver, amount);
    }
}
