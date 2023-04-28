// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../libraries/RingBufferLib.sol";
import "../libraries/TwabLib.sol";

/// @title TwabLibExposed contract to test TwabLib library
/// @author Asymetrix Protocol Inc.
contract TwabLibExposed is Initializable {
    uint24 public constant MAX_CARDINALITY = 16777215;

    using TwabLib for ObservationLib.Observation[MAX_CARDINALITY];

    TwabLib.Account internal account;

    event Updated(
        TwabLib.AccountDetails accountDetails,
        ObservationLib.Observation twab,
        bool isNew
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {}

    function details() external view returns (TwabLib.AccountDetails memory) {
        return account.details;
    }

    function twabs()
        external
        view
        returns (ObservationLib.Observation[] memory)
    {
        ObservationLib.Observation[]
            memory _twabs = new ObservationLib.Observation[](
                account.details.cardinality
            );

        for (uint256 i = 0; i < _twabs.length; i++) {
            _twabs[i] = account.twabs[i];
        }

        return _twabs;
    }

    function increaseBalance(
        uint256 _amount,
        uint32 _currentTime
    )
        external
        returns (
            TwabLib.AccountDetails memory accountDetails,
            ObservationLib.Observation memory twab,
            bool isNew
        )
    {
        (accountDetails, twab, isNew) = TwabLib.increaseBalance(
            account,
            uint208(_amount),
            _currentTime
        );
        account.details = accountDetails;
        emit Updated(accountDetails, twab, isNew);
    }

    function decreaseBalance(
        uint256 _amount,
        string memory _revertMessage,
        uint32 _currentTime
    )
        external
        returns (
            TwabLib.AccountDetails memory accountDetails,
            ObservationLib.Observation memory twab,
            bool isNew
        )
    {
        (accountDetails, twab, isNew) = TwabLib.decreaseBalance(
            account,
            uint208(_amount),
            _revertMessage,
            _currentTime
        );

        account.details = accountDetails;

        emit Updated(accountDetails, twab, isNew);
    }

    function getAverageBalanceBetween(
        uint32 _startTime,
        uint32 _endTime,
        uint32 _currentTime
    ) external view returns (uint256) {
        return
            TwabLib.getAverageBalanceBetween(
                account.twabs,
                account.details,
                _startTime,
                _endTime,
                _currentTime
            );
    }

    function oldestTwab()
        external
        view
        returns (uint24 index, ObservationLib.Observation memory twab)
    {
        return TwabLib.oldestTwab(account.twabs, account.details);
    }

    function newestTwab()
        external
        view
        returns (uint24 index, ObservationLib.Observation memory twab)
    {
        return TwabLib.newestTwab(account.twabs, account.details);
    }

    function getBalanceAt(
        uint32 _target,
        uint32 _currentTime
    ) external view returns (uint256) {
        return
            TwabLib.getBalanceAt(
                account.twabs,
                account.details,
                _target,
                _currentTime
            );
    }

    function push(
        TwabLib.AccountDetails memory _accountDetails
    ) external pure returns (TwabLib.AccountDetails memory) {
        return TwabLib.push(_accountDetails);
    }
}
