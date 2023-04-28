// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../prize-pool/PrizePool.sol";

import "./PrizePoolStub.sol";

contract PrizePoolHarness is PrizePool {
    uint256 public currentTime;

    PrizePoolStub public prizePoolStub;

    function initialize(
        address _owner,
        PrizePoolStub _prizePoolStub,
        IERC20Upgradeable _rewardToken,
        uint256 _rewardPerSecond,
        uint32 _maxClaimInterval,
        uint32 _claimInterval,
        uint32 _freeExitDuration,
        uint32 _firstLidoRebaseTimestamp,
        uint16 _lidoAPR
    ) external initializer {
        __PrizePool_init_unchained(
            _owner,
            _rewardToken,
            _rewardPerSecond,
            _maxClaimInterval,
            _claimInterval,
            _freeExitDuration,
            _firstLidoRebaseTimestamp,
            _lidoAPR
        );

        prizePoolStub = _prizePoolStub;
    }

    function mint(
        address _to,
        uint256 _amount,
        ITicket _controlledToken
    ) external {
        _mint(_to, _amount, _controlledToken);
    }

    function internalCurrentTime() external view returns (uint256) {
        return super._currentTime();
    }

    function _canAwardExternal(
        address _externalToken
    ) internal view override returns (bool) {
        return prizePoolStub.canAwardExternal(_externalToken);
    }

    function _token() internal view override returns (IERC20Upgradeable) {
        return IERC20Upgradeable(prizePoolStub.depositToken());
    }

    function _balance() internal override returns (uint256) {
        return prizePoolStub.balanceOfToken(address(this));
    }

    function _supply(uint256 mintAmount) internal override {
        prizePoolStub.supplyTokenTo(mintAmount, address(this));
    }

    function _redeem(uint256 redeemAmount) internal override returns (uint256) {
        return prizePoolStub.redeemToken(redeemAmount);
    }

    function setCurrentAwardBalance(uint256 amount) external {
        _currentAwardBalance = amount;
    }

    function testOnlyInitializingModifier(
        address _owner,
        IERC20Upgradeable _rewardToken,
        uint256 _rewardPerSecond,
        uint32 _maxClaimInterval,
        uint32 _claimInterval,
        uint32 _freeExitDuration,
        uint32 _firstLidoRebaseTimestamp,
        uint16 _lidoAPR
    ) external {
        __PrizePool_init_unchained(
            _owner,
            _rewardToken,
            _rewardPerSecond,
            _maxClaimInterval,
            _claimInterval,
            _freeExitDuration,
            _firstLidoRebaseTimestamp,
            _lidoAPR
        );
    }
}
