// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../ControlledToken.sol";

contract ControlledTokenHarness is ControlledToken {
    function testOnlyInitializingModifier(
        string memory _name,
        string memory _symbol,
        uint8 decimals_,
        address _controller
    ) external {
        __ControlledToken_init_unchained(
            _name,
            _symbol,
            decimals_,
            _controller
        );
    }
}
