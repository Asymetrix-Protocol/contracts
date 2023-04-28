// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../DrawBuffer.sol";

contract DrawBufferHarness is DrawBuffer {
    function addMultipleDraws(
        uint256 _start,
        uint256 _numberOfDraws,
        uint32 _timestamp
    ) external {
        for (uint256 index = _start; index <= _numberOfDraws; ++index) {
            IDrawBeacon.Draw memory _draw;

            _draw.drawId = uint32(index);
            _draw.timestamp = _timestamp;
            _draw.beaconPeriodStartedAt = 10;
            _draw.beaconPeriodSeconds = 20;

            _pushDraw(_draw);
        }
    }

    function testOnlyInitializingModifier(address _owner) external {
        __DrawBuffer_init(_owner);
    }

    function testOnlyInitializingModifier(uint8 _cardinality) external {
        __DrawBuffer_init_unchained(_cardinality);
    }
}
