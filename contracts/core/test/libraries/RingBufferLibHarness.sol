// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "../../libraries/DrawRingBufferLib.sol";
import "../../libraries/RingBufferLib.sol";

/**
 * @title Expose the RingBufferLib for unit tests.
 * @author Asymetrix Protocol Inc.
 */
contract RingBufferLibHarness {
    using RingBufferLib for DrawRingBufferLib.Buffer;

    function newestIndex() external pure returns (uint256) {
        return RingBufferLib.newestIndex(0, 0);
    }
}
