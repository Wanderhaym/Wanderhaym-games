// Let the inline forge perform its first strike before the large WebGL module
// is requested. This guarantees an immediate visual response on slow devices
// and creates a real code-split boundary for Three.js and post-processing.
requestAnimationFrame(() => {
  void import('./core/Experience').then(({ Experience }) => {
    const experience = new Experience();
    return experience.start();
  }).catch((error) => {
    console.error('Could not start Wanderhaym', error);
    const status = document.querySelector<HTMLElement>('#loaderStatus');
    if (status) status.textContent = 'НЕ УДАЛОСЬ ОТКРЫТЬ МИР';
  });
});
