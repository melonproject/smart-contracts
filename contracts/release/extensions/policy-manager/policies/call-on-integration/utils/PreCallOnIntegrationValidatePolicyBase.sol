// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../../utils/PolicyBase.sol";

/// @title CallOnIntegrationPreValidatePolicyMixin Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A mixin contract for policies that only implement the PreCallOnIntegration policy hook
abstract contract PreCallOnIntegrationValidatePolicyBase is PolicyBase {
    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks()
        external
        view
        override
        returns (IPolicyManager.PolicyHook[] memory implementedHooks_)
    {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.PreCallOnIntegration;

        return implementedHooks_;
    }

    /// @notice Helper to decode rule arguments
    function __decodeRuleArgs(bytes memory _encodedRuleArgs)
        internal
        pure
        returns (address adapter_, bytes4 selector_)
    {
        return abi.decode(_encodedRuleArgs, (address, bytes4));
    }
}
