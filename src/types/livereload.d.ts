declare module "livereload" {
  interface LiveReloadServer {
    watch(paths: string | string[]): void;
  }

  interface CreateServerOptions {
    exts?: string[];
    delay?: number;
    port?: number;
  }

  function createServer(options?: CreateServerOptions): LiveReloadServer;

  export { createServer };
  export default { createServer };
}
