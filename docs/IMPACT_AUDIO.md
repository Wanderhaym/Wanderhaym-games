# Automatic impact audio in My Games

The 3D world's impact WAV no longer depends on successfully playing background
music. `ImpactAudio` requests playback on each visible contact, including before
any user gesture when the host permits autoplay. Browser rejection is respected;
the next visible hit can retry after interaction. Music controls are unchanged.

The approved Loader Kit remains byte-for-byte unchanged. `ForgeLoader` passes
`soundVolume: 0` and `LoaderImpactSound` observes its existing `data-state=contact`.
This routes splash and world hits through the same application-owned player,
without the kit's preload-ready gate or two audible copies of the sound.
`scripts/sync-loader.mjs` can still import the approved kit without losing this fix.

The WAV, volumes (0.075 splash / 0.065 world), frames and timeline are unchanged.
Play requests that do not start within 180 ms are cancelled. Closing/failing the
splash cancels its pending request; hiding the page also stops playing audio.
The hidden WebGL world cannot produce extra sounds behind the splash.

Diagnostics on the HTML element: `data-impact-audio` (starting, playing, blocked,
late, error or idle), `data-impact-audio-error`, `data-impact-audio-source`, and
`data-impact-audio-attempts`. These describe the media API result, not a measurement
of physical speaker output. No network telemetry or saved settings are added.

Run `npm run test:audio` (Node 24+) and `npm run build`. Verify actual splash-to-world
playback in a browser and separately in Android VK: desktop gesture tests cannot
establish the policy applied by the Android host. No autoplay bypass is promised.
