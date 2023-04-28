// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../Manageable.sol";

contract ManageableHarness is Manageable {
    event ReallyCoolEvent(address);

    function initialize(address _initialOwner) public initializer {
        __Manageable_init_unchained(_initialOwner);
    }

    function protectedFunctionManager() external onlyManager {
        emit ReallyCoolEvent(msg.sender);
    }

    function protectedFunctionManagerOrOwner() external onlyManagerOrOwner {
        emit ReallyCoolEvent(msg.sender);
    }

    function testOnlyInitializingModifier(address _initialOwner) external {
        __Manageable_init_unchained(_initialOwner);
    }
}
