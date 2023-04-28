// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../RNGServiceChainlinkV2.sol";

contract RNGServiceChainlinkV2Harness is RNGServiceChainlinkV2 {
    function subscribe() external {
        address[] memory consumers = new address[](1);

        consumers[0] = address(this);

        subscriptionId = vrfCoordinator.createSubscription();

        vrfCoordinator.addConsumer(subscriptionId, consumers[0]);
    }

    function setRequestCounter(uint32 _requestCounter) external {
        requestCounter = _requestCounter;
    }

    function rawFulfillRandomWordsStub(
        uint256 requestId,
        uint256[] memory randomWords
    ) external {
        fulfillRandomWords(requestId, randomWords);
    }

    function testOnlyInitializingModifier(
        address _owner,
        VRFCoordinatorV2Interface _vrfCoordinator,
        uint64 _subscriptionId,
        bytes32 _keyHash
    ) external {
        __RNGServiceChainlinkV2_init(
            _owner,
            _vrfCoordinator,
            _subscriptionId,
            _keyHash
        );
    }

    function testOnlyInitializingModifier(
        VRFCoordinatorV2Interface _vrfCoordinator,
        uint64 _subscriptionId,
        bytes32 _keyHash
    ) external {
        __RNGServiceChainlinkV2_init_unchained(
            _vrfCoordinator,
            _subscriptionId,
            _keyHash
        );
    }

    function testOnlyInitializingModifier(address _vrfCoordinator) external {
        __VRFConsumerBaseV2_init_unchained(_vrfCoordinator);
    }
}
