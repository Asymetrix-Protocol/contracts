// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../Ownable.sol";

contract OwnableHarness is Ownable {
    event ReallyCoolEvent(address);

    function initialize(address _initialOwner) public initializer {
        __Ownable_init_unchained(_initialOwner);
    }

    function protectedFunction() external onlyOwner {
        emit ReallyCoolEvent(msg.sender);
    }

    function testOnlyInitializingModifier(address _initialOwner) external {
        __Ownable_init_unchained(_initialOwner);
    }
}
