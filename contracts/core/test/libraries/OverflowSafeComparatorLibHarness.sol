// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../../libraries/OverflowSafeComparatorLib.sol";

contract OverflowSafeComparatorLibHarness is Initializable {
    using OverflowSafeComparatorLib for uint32;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {}

    function ltHarness(
        uint32 _a,
        uint32 _b,
        uint32 _timestamp
    ) external pure returns (bool) {
        return _a.lt(_b, _timestamp);
    }

    function lteHarness(
        uint32 _a,
        uint32 _b,
        uint32 _timestamp
    ) external pure returns (bool) {
        return _a.lte(_b, _timestamp);
    }

    function checkedSub(
        uint256 _a,
        uint256 _b,
        uint256 _timestamp
    ) external pure returns (uint32) {
        return uint32(_a).checkedSub(uint32(_b), uint32(_timestamp));
    }
}
