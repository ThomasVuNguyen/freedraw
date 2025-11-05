# Sync Architecture (v0.1.55)

## Overview
Hybrid polling + real-time subscription system optimized for collaborative drawing with ownership protection.

## Data Flow

### Writes (User ’ Database)
**Debounced Save (500ms)**
- Triggers after user stops editing
- Blocks unauthorized edits from saving (uses previous version)
- Location: `src/useCollaboration.js:359-510`

**Save Triggers:**
1. **Debounced** (500ms after last change) - Primary
2. **10s autosave** - Fallback safety net
3. **Page visibility** - Before tab hidden
4. **Page unload** - Before close
5. **Manual button** - User-triggered

**Ownership Check on Save:**
```javascript
if (userIsAdmin || !owner || owner === userId) {
  // Save the change
} else {
  // Block save - use previous version instead
}
```

### Reads (Database ’ User)

**Smart Polling (2s intervals)**
- **Paused while editing** - `hasPendingSaveRef.current === true`
- **Resumes when idle** - After save completes
- **Post-save fetch** - Immediate fetch after saving (100ms delay)
- Location: `src/useCollaboration.js:224-346`

**Poll Skip Logic:**
```javascript
if (reason === 'poll' && hasPendingSaveRef.current) {
  console.log('Skipping poll: user has pending changes')
  return // No database read during active work
}
```

**Merge Strategy:**
- Version-based comparison (`element.version`)
- Preserves local elements with higher version
- Keeps Firebase elements with higher/equal version

## Ownership Protection

### Authorization (v0.1.49+)
**Edit Protection** - `src/useCollaboration.js:549-560`
- Checks `customData.createdBy` ownership
- Blocks unauthorized edits at save time
- Doesn't interrupt user (no `updateScene()` calls)

**Delete Protection** - `src/useCollaboration.js:564-575`
- Restores deleted elements to save if not owned
- Locally appears deleted until next poll

**Admin Override:**
- Admins can edit/delete anything
- Synced from Firebase `roles/admins` in real-time

### Why No Immediate Revert (v0.1.54)
Previous versions (v0.1.51-0.1.53) called `updateScene()` to revert unauthorized changes immediately, which **interrupted active drawing**.

**Solution:** Let unauthorized changes appear locally, block them from saving, let polls restore correct state.

## Real-Time Subscriptions

**Presence System** (cursors, users) - `src/useCollaboration.js:50-80`
- Uses Firebase `onValue()` for instant updates
- Cursor positions updated every 50ms
- Heartbeat every 20s

**Admin Roles** - `src/useCollaboration.js:82-98`
- Real-time `onValue()` subscription
- Path: `roles/admins`

## Key Constants

```javascript
CANVAS_POLL_INTERVAL = 2000      // 2 seconds
HEARTBEAT_INTERVAL = 20000       // 20 seconds
DEBOUNCE_DELAY = 500             // 500ms
AUTOSAVE_INTERVAL = 10000        // 10 seconds (fallback)
```

## Performance Characteristics

**Database Operations:**
- Canvas saves: ~1-3 per minute (debounced)
- Canvas reads: ~30 per minute (2s poll) when idle, 0 when editing
- Presence updates: ~1.2 per second per user (50ms cursor + 20s heartbeat)
- Admin role reads: Real-time, minimal (subscription)

**Conflict Resolution:**
- Last-write-wins with version numbers
- Client-side ownership enforcement
- No server-side validation (security concern - see below)

## Evolution History

- **v0.1.45** - Initial 500ms debounced save
- **v0.1.46** - Reduced poll to 2s
- **v0.1.47** - Fixed infinite save loops
- **v0.1.48** - Changed poll interval constant
- **v0.1.49** - Added ownership protection
- **v0.1.51** - Immediate revert with `updateScene()` (caused interruptions)
- **v0.1.52-0.1.53** - Attempted smart interruption detection (still buggy)
- **v0.1.54** - **Breakthrough**: Removed immediate reverts entirely
- **v0.1.55** - **Perfect**: Pause polling during active edits

## Known Limitations

1. **Client-side only enforcement** - Direct Firebase SDK access can bypass
2. **2s visibility window** - Unauthorized changes visible locally for up to 2s
3. **No CRDT/OT** - Last-write-wins can lose simultaneous edits
4. **Unowned elements** - Elements without `customData.createdBy` are editable by all

## Recommendations

- Add server-side Firebase rules for ownership enforcement
- Consider operational transforms for true conflict-free collaboration
- Add server-side validation of ownership claims
- Handle edge case of unowned/legacy elements
