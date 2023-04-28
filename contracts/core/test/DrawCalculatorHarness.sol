// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../DrawCalculator.sol";

contract DrawCalculatorHarness is DrawCalculator {
    function testOnlyInitializingModifier(
        ITicket _ticket,
        IDrawBuffer _drawBuffer,
        IPrizeDistributionBuffer _prizeDistributionBuffer
    ) external {
        __DrawCalculator_init_unchained(
            _ticket,
            _drawBuffer,
            _prizeDistributionBuffer
        );
    }
}
