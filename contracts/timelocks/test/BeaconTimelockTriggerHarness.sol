// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../BeaconTimelockTrigger.sol";

contract BeaconTimelockTriggerHarness is BeaconTimelockTrigger {
    function testOnlyInitializingModifier(
        address _owner,
        IPrizeDistributionFactory _prizeDistributionFactory,
        IDrawCalculatorTimelock _timelock
    ) external {
        __BeaconTimelockTrigger_init_unchained(
            _owner,
            _prizeDistributionFactory,
            _timelock
        );
    }
}
