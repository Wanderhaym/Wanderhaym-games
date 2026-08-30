// The splash and the WebGL mascot share identical URLs and the browser cache.
// Keep every approved filename unchanged; public paths work under Pages and VK.
export const loaderBase = new URL(import.meta.env.BASE_URL + 'wanderhaym-loader/', document.baseURI);
export function loaderAsset(name: string): string {
  return new URL('assets/' + name, loaderBase).href;
}
