// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../DrawBeacon.sol";

contract DrawBeaconHarness is DrawBeacon {
    uint64 internal time;

    function setCurrentTime(uint64 _time) external {
        time = _time;
    }

    function _currentTime() internal view override returns (uint64) {
        return time;
    }

    function currentTime() external view returns (uint64) {
        return _currentTime();
    }

    function _currentTimeInternal() external view returns (uint64) {
        return super._currentTime();
    }

    function testOnlyInitializingModifier(
        address _owner,
        IDrawBuffer _drawBuffer,
        uint32 _nextDrawId,
        uint64 _beaconPeriodStart,
        uint32 _beaconPeriodSeconds
    ) external {
        __DrawBeacon_init_unchained(
            _owner,
            _drawBuffer,
            _nextDrawId,
            _beaconPeriodStart,
            _beaconPeriodSeconds
        );
    }
}
