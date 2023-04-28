// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../../libraries/ObservationLib.sol";

/// @title Time-Weighted Average Balance Library
/// @notice This library allows you to efficiently track a user's historic
///         balance.
/// @author Asymetrix Protocol Inc.
contract ObservationLibHarness is Initializable {
    /// @notice The maximum number of twab entries
    uint24 public constant MAX_CARDINALITY = 16777215; // 2**24

    ObservationLib.Observation[MAX_CARDINALITY] internal observations;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {}

    function setObservations(
        ObservationLib.Observation[] calldata _observations
    ) external {
        for (uint256 i = 0; i < _observations.length; i++) {
            observations[i] = _observations[i];
        }
    }

    function binarySearch(
        uint24 _observationIndex,
        uint24 _oldestObservationIndex,
        uint32 _target,
        uint24 _cardinality,
        uint32 _time
    )
        external
        view
        returns (
            ObservationLib.Observation memory beforeOrAt,
            ObservationLib.Observation memory atOrAfter
        )
    {
        return
            ObservationLib.binarySearch(
                observations,
                _observationIndex,
                _oldestObservationIndex,
                _target,
                _cardinality,
                _time
            );
    }
}
