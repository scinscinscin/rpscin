import { Server as ERPCServer, ServerConstructorOptions } from "@scinorandex/erpc";
import { RouterT } from "./router";

export function Server(opts: ServerConstructorOptions, router: RouterT<string, unknown, unknown, unknown>) {
  return new ERPCServer(opts, router.__internal.router);
}
