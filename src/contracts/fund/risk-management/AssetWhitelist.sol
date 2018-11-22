pragma solidity ^0.4.21;

import "../policies/Policy.sol";
import "./AssetList.sol";

/// @notice Assets can be removed from but not added to whitelist
contract AssetWhitelist is AssetList, Policy {
    function removeFromWhitelist(address _asset) external auth {
        require(isMember(_asset));
        delete list[_asset];
        uint i = getAssetIndex(_asset);
        for (i; i < mirror.length-1; i++){
            mirror[i] = mirror[i+1];
        }
        mirror.length--;
    }

    function getAssetIndex(address _asset) public view returns (uint) {
        for (uint i = 0; i < mirror.length; i++) {
            if (mirror[i] == _asset) {
                return i;
            }
        }
    }

    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
        return isMember(addresses[3]);
    }

    function position() external view returns (uint) {
        return 0;
    }
}