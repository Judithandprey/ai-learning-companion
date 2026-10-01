// What `signin_launcher.mjs check` owns, and how it lets go of it (no Windows call is made in this file: the callers
// give the functions that look and end, so the rule itself is tested without a display).
//
// Owned by one check: the processes it started, known by that check's own port in their command line (the app's main
// process and the checker), and the folder it made for itself. The rule:
//   - a process is ended only if it is owned at that look, first by a close request and only then by force;
//   - the folder is removed only if this check made it AND every owned process is confirmed gone and nothing that is
//     not owned holds the check's port;
//   - when a look fails, nothing more is ended and nothing is removed: the state is kept and said as unknown.

/**
 * @param {object} d
 * @param {() => Promise<{ owned: number[], others: number[] }>} d.look  owned: PIDs that are this check's by their command
 *        line; others: PIDs that hold the check's port without being owned. Throws when it cannot look.
 * @param {(pid: number) => Promise<void>} d.askToClose   a close request to one owned PID (may throw; it is recorded)
 * @param {(pid: number) => Promise<void>} d.endByForce   ends one owned PID (may throw; it is recorded)
 * @param {(ms: number) => Promise<void>} d.sleep
 * @param {() => number} [d.now]             wall clock in ms (the waits count the time the looks take too)
 * @param {boolean} d.ownsFolder             this check made the folder itself
 * @param {() => Promise<boolean>} d.removeFolder   removes the folder; resolves to whether one was removed
 */
export async function releaseOwned({ look, askToClose, endByForce, sleep, now = Date.now, ownsFolder, removeFolder, waitSelfMs = 20000, waitCloseMs = 15000, waitForceMs = 10000, stepMs = 500 }) {
  const record = { owned_seen: [], asked_to_close: [], ended_by_force: [], errors: [], exit: 'unknown', left_running: [], not_owned_on_the_port: [], folder: 'kept', folder_reason: null };
  const see = async () => {
    try {
      const s = await look();
      if (!Array.isArray(s?.owned) || !Array.isArray(s?.others)) throw new Error('unreadable answer');
      for (const pid of s.owned) if (!record.owned_seen.includes(pid)) record.owned_seen.push(pid);
      return s;
    } catch (error) { record.errors.push(`look: ${String(error?.message ?? error).slice(0, 200)}`); return null; }
  };
  // Looks until nothing owned is left, or the time is over. null: a look failed (nothing more is done after that).
  const until = async (ms) => {
    const end = now() + ms;
    let state = await see();
    while (state && state.owned.length > 0 && now() < end) { await sleep(stepMs); state = await see(); }
    return state;
  };
  const each = async (pids, act, done, what) => { for (const pid of pids) { try { await act(pid); done.push(pid); } catch (error) { record.errors.push(`${what} ${pid}: ${String(error?.message ?? error).slice(0, 200)}`); } } };

  let state = await until(waitSelfMs);                       // 1. it may end by itself (the check asked the window to close)
  if (state && state.owned.length > 0) { await each(state.owned, askToClose, record.asked_to_close, 'close request'); state = await until(waitCloseMs); }   // 2. a close request
  if (state && state.owned.length > 0) { await each(state.owned, endByForce, record.ended_by_force, 'end'); state = await until(waitForceMs); }             // 3. force, owned PIDs only
  if (state) {
    record.left_running = state.owned;
    record.not_owned_on_the_port = state.others;
    record.exit = state.owned.length === 0 && state.others.length === 0 ? 'confirmed' : 'still_running';
  }
  if (!ownsFolder) record.folder_reason = 'this check did not make the folder: it is not this check\'s to remove';
  else if (record.exit !== 'confirmed') record.folder_reason = `the exit of what this check started is ${record.exit === 'unknown' ? 'not known' : 'not confirmed (a process is still there)'}: the folder is kept as it is`;
  else {
    try { record.folder = (await removeFolder()) ? 'removed' : 'none_was_there'; } catch (error) { record.folder_reason = `the folder could not be removed: ${String(error?.message ?? error).slice(0, 200)}`; }
  }
  return record;
}
