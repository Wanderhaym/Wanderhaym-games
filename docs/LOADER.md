# Wanderhaym Loader 1.0.2

The active website and VK Mini App 54709580 both use this Veb/Three.js project.
Do not deploy the obsolete standalone catalog formerly named Moy igry.

The approved portable kit is vendored byte-for-byte in `static/wanderhaym-loader/`.
To refresh the same release locally, run `node scripts/sync-loader.mjs` with the
neighboring `Wanderhaym-Loader-Kit` folder present (or pass its absolute path).
The script validates SHA-256 for every copied file, including the license.
For a future kit version, update the version guards and cache-busting references.

`src/main.ts` starts one loader before importing the WebGL chunk.
`src/ui/ForgeLoader.ts` preserves the existing Experience API and shares that
instance. The old inline 90 ms kickoff is removed. Application readiness is
still reported by Experience after host initialization, saved portal progress,
and world initialization; decorative readiness never blocks that startup work.
The loader and WebGL mascot share asset URLs, without changing approved pixels
or the in-world animation sequence. After complete(), do not query loader child
elements: the portable runtime automatically releases them.

## Checks

- `npm run build` runs TypeScript validation and the production build.
- `node scripts/loader-qa-server.mjs` serves only the local dist folder.
- `/normal/`: normal startup and final transition.
- `/slow/?loader-demo`: 1-second media delays; no invisible first hit.
- `/broken-module/`: missing loader module, readable error and retry button.
- `/broken-frame/`: missing shared game frame, explicit failure and retry.
- Add `?vk_app_id=54709580` or `?vk_client=ok` to check host-specific startup.
- Check 320x568 portrait, 812x375 landscape and desktop. After exit, verify that
  the loader is hidden and previous/next game controls work.

GitHub Actions publishes Pages after main is pushed. The same validated build
is deployed to VK Hosting using the existing app configuration.
