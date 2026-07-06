Set of possible actions:
- Mark a square as star
- Mark a square as elim
- Split a square: Creates original board with square bordered in green, star board with square bordered in blue, and elim board with square bordered in orange.
On any board, including one with already split squares, you can split a new square.
From a board with a split cell (orig, star, elim), you can navigate to either of the other two.
Each board has a direct parent. When you mark a board as impossible, the parent inherits the state of the remaining possible child and becomes the active board. Any non-split change on the parent is propagated to the children, overwriting any state that exists there. The value of the split cell in the parent is not allowed to be set except by declaring the board for the other possibility impossible. When you first split a cell, it automatically brings you to the case where it is a star. However, clicking on that cell will cycle through the different boards in the order (orig, elim, star). A board cannot be restored. However, there should be undo and redo buttons that include things like splitting squares and marking boards as impossible. For the time being this is a global undo rather than a board-specific undo.


{
  type: COUNT
  count: 2,
  cells: [
    (1,1), (1,2), (1,3), (1,4), (1,5), (1,6), (1,7), (1,8), (1,9), (1,10)
  ]
}

{
  type: OR
  of: [
    {
      type: STAR
      cell: (1,1)
    },
    {
      type: ELIM
      cell: (1,1)
    }
  ]
}

{
  type: AND
  of: [
    ...
  ]
}
