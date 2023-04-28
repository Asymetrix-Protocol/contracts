// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

interface PrizePoolStub {
    /// @notice Returns the ERC20 asset token used for deposits.
    /// @return The ERC20 asset token address.
    function depositToken() external view returns (address);

    /// @notice Returns the total balance (in asset tokens). This includes the
    ///         deposits and interest.
    /// @return The underlying balance of asset tokens.
    function balanceOfToken(address addr) external returns (uint256);

    /// @notice Supplies tokens to the yield source. Allows assets to be
    ///         supplied on other user's behalf using the `to` param.
    /// @param amount The amount of asset tokens to be supplied. Denominated in
    ///               `depositToken()` as above.
    /// @param to The user whose balance will receive the tokens.
    function supplyTokenTo(uint256 amount, address to) external;

    /// @notice Redeems tokens from the yield source.
    /// @param amount The amount of asset tokens to withdraw. Denominated in
    ///               `depositToken()` as above.
    /// @return The actual amount of interst bearing tokens that were redeemed.
    function redeemToken(uint256 amount) external returns (uint256);

    function canAwardExternal(
        address _externalToken
    ) external view returns (bool);
}
