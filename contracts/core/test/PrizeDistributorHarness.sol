// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../PrizeDistributor.sol";

contract PrizeDistributorHarness is PrizeDistributor {
    function testOnlyInitializingModifier(address _owner) external {
        __PrizeDistributor_init(_owner);
    }

    function testOnlyInitializingModifier(
        IERC20Upgradeable _token,
        IDrawBuffer _drawBuffer,
        IPrizeDistributionBuffer _prizeDistributionBuffer,
        IRNGServiceChainlinkV2 _rngService,
        uint16[] calldata _distribution,
        uint32 _rngTimeout
    ) external {
        __PrizeDistributor_init_unchained(
            _token,
            _drawBuffer,
            _prizeDistributionBuffer,
            _rngService,
            _distribution,
            _rngTimeout
        );
    }
}
