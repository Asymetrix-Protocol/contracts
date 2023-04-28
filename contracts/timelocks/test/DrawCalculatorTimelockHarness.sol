// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../DrawCalculatorTimelock.sol";

contract DrawCalculatorTimelockHarness is DrawCalculatorTimelock {
    function testOnlyInitializingModifier(address _owner) external {
        __DrawCalculatorTimelock_init_unchained(_owner);
    }
}
