// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../libraries/DrawRingBufferLib.sol";

/**
 * @title  Expose the DrawRingBufferLibrary for unit tests
 * @author Asymetrix Protocol Inc.
 */
contract DrawRingBufferLibExposed is Initializable {
    using DrawRingBufferLib for DrawRingBufferLib.Buffer;

    uint16 public constant MAX_CARDINALITY = 256;
    DrawRingBufferLib.Buffer internal bufferMetadata;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(uint8 _cardinality) external initializer {
        bufferMetadata.cardinality = _cardinality;
    }

    function _push(
        DrawRingBufferLib.Buffer memory _buffer,
        uint32 _drawId
    ) external pure returns (DrawRingBufferLib.Buffer memory) {
        return DrawRingBufferLib.push(_buffer, _drawId);
    }

    function _getIndex(
        DrawRingBufferLib.Buffer memory _buffer,
        uint32 _drawId
    ) external pure returns (uint32) {
        return DrawRingBufferLib.getIndex(_buffer, _drawId);
    }
}
