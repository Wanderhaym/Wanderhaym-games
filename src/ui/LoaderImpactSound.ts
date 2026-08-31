/** Adapt the kit's existing visual contact state without forking its assets or
 * animation. The kit's own player is silent; only the app plays the approved WAV.
 */
export function connectLoaderImpactSound(
  root: HTMLElement,
  play: () => void,
  stopPending: () => void,
): () => void {
  const observer = new MutationObserver(() => {
    const state = root.dataset.state;
    if (state === 'contact') play();
    if (state === 'complete' || state === 'failed') disconnect();
  });
  const disconnect = () => {
    observer.disconnect();
    stopPending();
  };
  observer.observe(root, { attributes: true, attributeFilter: ['data-state'] });
  return disconnect;
}
