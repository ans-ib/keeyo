const EASE = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

function duration() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
}

export function collapseRow(row) {
  const ms = duration();
  return new Promise((resolve) => {
    if (!ms) { resolve(); return; }
    row.style.height = `${row.offsetHeight}px`;
    row.style.overflow = 'hidden';
    row.style.pointerEvents = 'none';
    void row.offsetHeight;
    row.style.transition = `height ${ms}ms ${EASE}, padding ${ms}ms ${EASE}, border-width ${ms}ms ${EASE}, opacity ${Math.round(ms * 0.6)}ms ease`;
    row.style.height = '0px';
    row.style.paddingTop = '0';
    row.style.paddingBottom = '0';
    row.style.borderBottomWidth = '0';
    row.style.opacity = '0';
    setTimeout(resolve, ms);
  });
}

export function expandRow(row) {
  const ms = duration();
  if (!ms || !row) return;
  const height = row.offsetHeight;
  const computed = getComputedStyle(row);
  const paddingTop = computed.paddingTop;
  const paddingBottom = computed.paddingBottom;
  row.style.overflow = 'hidden';
  row.style.height = '0px';
  row.style.paddingTop = '0';
  row.style.paddingBottom = '0';
  row.style.opacity = '0';
  void row.offsetHeight;
  row.style.transition = `height ${ms}ms ${EASE}, padding ${ms}ms ${EASE}, opacity ${ms}ms ease`;
  row.style.height = `${height}px`;
  row.style.paddingTop = paddingTop;
  row.style.paddingBottom = paddingBottom;
  row.style.opacity = '1';
  setTimeout(() => { row.style.cssText = ''; }, ms);
}
