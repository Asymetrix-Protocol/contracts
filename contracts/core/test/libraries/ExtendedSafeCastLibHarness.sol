// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../../libraries/ExtendedSafeCastLib.sol";

contract ExtendedSafeCastLibHarness is Initializable {
    using ExtendedSafeCastLib for uint256;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {}

    function toUint104(uint256 value) external pure returns (uint104) {
        return value.toUint104();
    }

    function toUint208(uint256 value) external pure returns (uint208) {
        return value.toUint208();
    }

    function toUint224(uint256 value) external pure returns (uint224) {
        return value.toUint224();
    }
}
