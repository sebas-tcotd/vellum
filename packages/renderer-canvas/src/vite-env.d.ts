// Type declarations for Vite-specific query suffixes used in this package.
// The ?worker suffix is resolved by the consuming app's Vite bundler.
declare module '*?worker' {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}
