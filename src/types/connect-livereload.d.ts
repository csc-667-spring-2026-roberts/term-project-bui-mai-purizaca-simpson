declare module "connect-livereload" {
  import type { RequestHandler } from "express";

  function connectLivereload(options?: {
    port?: number;
    hostname?: string;
    include?: RegExp;
    exclude?: RegExp;
  }): RequestHandler;

  export default connectLivereload;
}
