/** Explicitly releases a disposable WebGL surface when WebKit delays cleanup. */
export function releaseTemporaryWebGlContext(canvas: HTMLCanvasElement): void {
  if (typeof canvas.getContext !== 'function') return;
  const contexts = [canvas.getContext('webgl2'), canvas.getContext('webgl')];
  for (const context of contexts) {
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
