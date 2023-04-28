// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "./ERC20Mintable.sol";

import "../Reserve.sol";

contract ReserveHarness is Reserve {
    function setObservationsAt(
        ObservationLib.Observation[] calldata observations
    ) external {
        for (uint256 i = 0; i < observations.length; ++i) {
            reserveAccumulators[i] = observations[i];
        }

        nextIndex = uint24(observations.length);
        cardinality = uint24(observations.length);
    }

    function doubleCheckpoint(ERC20Mintable _token, uint256 _amount) external {
        _checkpoint();

        _token.mint(address(this), _amount);

        _checkpoint();
    }

    function testOnlyInitializingModifier(
        address _owner,
        IERC20Upgradeable _token
    ) external {
        __Reserve_init_unchained(_owner, _token);
    }

    function getOldestObservation()
        external
        returns (uint24 index, ObservationLib.Observation memory observation)
    {
        reserveAccumulators[0] = ObservationLib.Observation({
            amount: 0,
            timestamp: uint32(block.timestamp)
        });

        return _getOldestObservation(0);
    }
}
