module.exports = {
  skipFiles: [
    "ASXHarness.sol",

    "core/test/ControlledTokenHarness.sol",
    "core/test/DrawBeaconHarness.sol",
    "core/test/DrawBufferHarness.sol",
    "core/test/DrawCalculatorHarness.sol",
    "core/test/DrawRingBufferExposed.sol",
    "core/test/EIP2612PermitMintable.sol",
    "core/test/ERC20Mintable.sol",
    "core/test/ERC721Mintable.sol",
    "core/test/PrizeDistributorHarness.sol",
    "core/test/PrizePoolHarness.sol",
    "core/test/PrizePoolStub.sol",
    "core/test/ReserveHarness.sol",
    "core/test/TicketHarness.sol",
    "core/test/TwabLibraryExposed.sol",

    "core/test/libraries/DrawRingBufferLibHarness.sol",
    "core/test/libraries/ExtendedSafeCastLibHarness.sol",
    "core/test/libraries/ObservationLibHarness.sol",
    "core/test/libraries/OverflowSafeComparatorLibHarness.sol",

    "timelocks/test/BeaconTimelockTriggerHarness.sol",
    "timelocks/test/DrawCalculatorTimelockHarness.sol",

    "owner-manager/test/ManageableHarness.sol",
    "owner-manager/test/OwnableHarness.sol",

    "rng-service/test/RNGServiceChainlinkV2Harness.sol",

    "twab-delegator/test/TWABDelegatorHarness.sol",
  ],
};
