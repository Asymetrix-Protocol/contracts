// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

/** @title IPrizeDistributionSource
 * @author Asymetrix Protocol Inc Team
 * @notice The PrizeDistributionSource interface.
 */
interface IPrizeDistributionSource {
    ///@notice PrizeDistribution struct created every draw
    ///@param startTimestampOffset The starting time offset in seconds from
    ///                            which Ticket balances are calculated.
    ///@param endTimestampOffset The end time offset in seconds from which
    ///                          Ticket balances are calculated.
    ///@param numberOfPicks Number of picks this draw has
    struct PrizeDistribution {
        uint32 startTimestampOffset;
        uint32 endTimestampOffset;
        uint104 numberOfPicks;
    }

    /**
     * @notice Gets PrizeDistribution list from array of drawIds
     * @param drawIds drawIds to get PrizeDistribution for
     * @return prizeDistributionList
     */
    function getPrizeDistributions(
        uint32[] calldata drawIds
    ) external view returns (PrizeDistribution[] memory);
}
