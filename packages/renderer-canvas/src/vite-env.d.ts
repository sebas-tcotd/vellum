// Type declarations for Vite-specific query suffixes used in this package.
// The ?worker and ?url suffixes are resolved by the consuming app's Vite bundler.
declare module '*?worker' {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}

declare module '*.woff2?url' {
  const url: string;
  export default url;
}
