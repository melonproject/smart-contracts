pragma solidity ^0.5.13;
pragma experimental ABIEncoderV2;

import "../factory/FundFactory.sol";
import "../fund/hub/Hub.sol";
import "./Version.i.sol";

/// @notice Controlled by governance
contract Version is FundFactory, DSAuth, VersionInterface {

    constructor(
        address _accountingFactory,
        address _feeManagerFactory,
        address _participationFactory,
        address _sharesFactory,
        address _tradingFactory,
        address _vaultFactory,
        address _policyManagerFactory,
        address _registry,
        address _postDeployOwner
    )
        FundFactory(
            _accountingFactory,
            _feeManagerFactory,
            _participationFactory,
            _sharesFactory,
            _tradingFactory,
            _vaultFactory,
            _policyManagerFactory,
            address(this)
        )
    {
        registry = _registry;
        setOwner(_postDeployOwner);
    }

    function shutDownFund(address _hub) external {
        require(
            managersToHubs[msg.sender] == _hub,
            "Conditions not met for fund shutdown"
        );
        Hub(_hub).shutDownFund();
    }
}
