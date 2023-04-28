// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../TWABDelegator.sol";

contract TWABDelegatorHarness is TWABDelegator {
    function testOnlyInitializingModifier(
        ITicket _ticket,
        uint96 _minLockDuration,
        uint96 _maxLockDuration
    ) external {
        __TWABDelegator_init_unchained(
            _ticket,
            _minLockDuration,
            _maxLockDuration
        );
    }

    function testOnlyInitializingModifier() external {
        __LowLevelDelegator_init_unchained();
    }
}
