// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface ICompLike is IERC20Upgradeable {
    function getCurrentVotes(address account) external view returns (uint96);

    function delegate(address delegate) external;
}
