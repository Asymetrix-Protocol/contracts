// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title IVRFConsumerBaseV2Mock
 * @author Asymetrix Protocol Inc Team
 * @notice An interface to mock Chainlink VRFConsumerBaseV2's methods.
 */
interface IVRFConsumerBaseV2Mock {
    /**
     * @notice Fulfills randomness on the calling contract.
     * @param requestId A randomness request ID.
     * @param randomWords A randomness itself.
     */
    function rawFulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) external;
}

/**
 * @title VRFCoordinatorMock
 * @author Asymetrix Protocol Inc Team
 * @notice A mock contract that replaces Chainlink's VRFCoordinator in the DEV
 *         environment.
 */
contract VRFCoordinatorMock is Initializable {
    struct Request {
        address requester;
        uint256[] randomness;
    }

    mapping(uint256 => Request) private requests;

    uint256 public randomNumbersCounter;

    uint256 public requestsCounter;

    /* ============ Constructor ============= */

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {}

    /* ============== External ============== */

    /**
     * @notice Get configuration relevant for making requests.
     * @return Global minimun for request confirmations.
     * @return Global maximum for request gas limit.
     * @return List of registered key hashes.
     */
    function getRequestConfig()
        external
        pure
        returns (uint16, uint32, bytes32[] memory)
    {
        bytes32[] memory _keyHashes = new bytes32[](4);

        _keyHashes[
            0
        ] = 0xff8dedfbfa60af186cf3c830acbc32c05aae823045ae5ea7da1e45fbfaba4f92;
        _keyHashes[
            1
        ] = 0x9fe0eebf5e446e3c998ec9bb19951541aee00bb90ea201ae456421a2ded86805;
        _keyHashes[
            2
        ] = 0x8b15aa058056a19f94f93564b50b7bf0764f89634f21546869048e173928891e;
        _keyHashes[
            3
        ] = 0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef;

        return (3, 2500000, _keyHashes);
    }

    /**
     * @notice Returns a request info by its ID.
     * @param _requestId An internal request ID.
     */
    function getRequest(
        uint256 _requestId
    ) external view returns (Request memory) {
        return requests[_requestId];
    }

    /**
     * @notice Request a set of random words.
     * param1 Any mocked key hash (isn't used).
     * param2 Any mocked subscription ID (isn't used).
     * param3 Any mocked minimum request confirmations number (isn't used).
     * param4 Any mocked callback gas limit (isn't used).
     * @param _numWords An array of uint256 random values you'd like to receive
     *                  in your rawFulfillRandomWords callback.
     * @return _requestId A unique identifier of the request. Can be used to
     *                    match a request to a response.
     */
    function requestRandomWords(
        bytes32,
        uint64,
        uint16,
        uint32,
        uint32 _numWords
    ) external returns (uint256 _requestId) {
        _requestId = ++requestsCounter;

        requests[_requestId].requester = msg.sender;
        requests[_requestId].randomness = new uint256[](_numWords);

        for (uint32 i = 0; i < _numWords; ++i) {
            requests[_requestId].randomness[i] = uint256(
                keccak256(abi.encodePacked(randomNumbersCounter++))
            );
        }
    }

    /**
     * @notice Fulfills requested randomness.
     * @param _requestId An internal request ID.
     */
    function fulfill(uint256 _requestId) external {
        Request memory _request = requests[_requestId];

        IVRFConsumerBaseV2Mock(_request.requester).rawFulfillRandomWords(
            _requestId,
            _request.randomness
        );
    }
}
