import { initializeForgeLoader, failForgeStartup } from './ui/ForgeLoader';

// Start the loader before requesting WebGL. Decorative frames must never
// become a prerequisite for loading the application itself.
void initializeForgeLoader().then(async () => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const { Experience } = await import('./core/Experience');
  await new Experience().start();
}).catch(failForgeStartup);
