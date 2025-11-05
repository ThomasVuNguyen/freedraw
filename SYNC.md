# How sync should and will work, assuming scenario of 2-1000 concurrent users, but we will use 2 users as analogy

- User 1 draws a new item, cursor has left the 'creating thing' state, item gets added immediately to database
- User 1 edit an item, cursor has left the 'editing thing' state, item gets removed from database
- User 1 removes an item, item is confirmed removed from the canvas, item gets removed from database
- On every 'write' sync, a gradient bar runs to indicate changes are being made, bar stops when saving is done

- User 2 has a button to press to refresh the entire canvas to get the latest canvas
- User 2 cannot edit any item made by User 1

- No scheduled sync