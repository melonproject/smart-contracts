pragma solidity ^0.5.13;

/// @dev Useful for testing force-sending of funds
contract SelfDestructing {
    function bequeath(address payable _heir) public {
        selfdestruct(_heir);
    }

    function () external payable {}
}
