import { refresh, render, syncData } from '../router.js';
import { state } from '../state.js';
import { toast } from './toast.js';

const UNDO_WINDOW_MS = 5000;
const pendingDeletes = new Set();

window.addEventListener('pagehide', () => {
  pendingDeletes.forEach((commit) => {
    try { commit({ keepalive: true }); } catch {}
  });
  pendingDeletes.clear();
});

window.addEventListener('pageshow', (e) => {
  if (e.persisted && state.me) refresh();
});

export function deleteWithUndo({ label, apply, revert, commit, rerender = render }) {
  apply();
  rerender();
  let undone = false;
  pendingDeletes.add(commit);
  const timer = setTimeout(async () => {
    pendingDeletes.delete(commit);
    if (undone) return;
    try {
      await commit();
    } catch (err) {
      toast(err.message, 'error');
    }
    try { await syncData(); } catch {}
    rerender();
  }, UNDO_WINDOW_MS);
  toast(label, 'success', {
    actionLabel: 'Undo',
    duration: UNDO_WINDOW_MS,
    onAction: () => {
      undone = true;
      clearTimeout(timer);
      pendingDeletes.delete(commit);
      revert();
      rerender();
    },
  });
}
