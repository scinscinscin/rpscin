import { Connection, WSValidatorReturnType } from "@scinorandex/erpc/dist/websocket";
import { Overwrite, RouteParameters } from "./RouteParameters";
import { FinalizedHandler, Router as ERPCRouter, RouterT as ERPCRouterT, WebSocketRouter } from "@scinorandex/erpc";

export type HTTPMethodTypes = "get" | "post" | "put" | "patch" | "delete";
type ConfigObjectKeys = HTTPMethodTypes | "ws";

type MergeParams<NewPath extends string, ExistingParams> = Overwrite<RouteParameters<NewPath>, ExistingParams>;

// prettier-ignore
type Inner<PathParams, MethodsObject, HandlerName extends string> = {
  [MethodName in Extract<keyof MethodsObject, ConfigObjectKeys>]: FinalizedHandler<
    unknown, unknown, MergeParams<HandlerName, PathParams>, unknown
  >;
};

type Outer<PathParams, Config> = {
  [HandlerName in keyof Config]: Inner<PathParams, Config[HandlerName], Extract<HandlerName, string>>;
};

export function createWebSocketEndpoint<
  Receives extends { [key: string]: any },
  Emits extends { [key: string]: any },
  PathParameters
>(
  validators: WSValidatorReturnType<Receives, Emits>,
  handler: (ctx: {
    params: PathParameters;
    query: { [key: string]: any };
    conn: Connection<{ Emits: Emits; Receives: Receives }>;
  }) => Promise<void>
): FinalizedHandler<Emits, Receives, PathParameters, {}> {
  return new FinalizedHandler({ validators, handler });
}

export interface RouterT<Path extends string, PathParameters, Subrouters, Config> {
  __internal: {
    path: Path;
    pathParameters: PathParameters;
    subrouters: Subrouters;
    config: Config;
    router: ERPCRouterT<{}>;
  };
  getSubroutedAt: () => Path;
  sub: <SubroutedAt extends string, Config extends Outer<MergeParams<SubroutedAt, PathParameters>, Config>>(
    subroutedAt: SubroutedAt,
    routerConfig: Config
  ) => RouterT<SubroutedAt, MergeParams<SubroutedAt, PathParameters>, Subrouters, Config>;
  config: <C extends Outer<PathParameters, C>>(hmm: C) => RouterT<Path, PathParameters, Subrouters, C>;
  mergeRouter: <A extends string, B, C, D>(
    subrouter: RouterT<A, B, C, D>
  ) => RouterT<Path, PathParameters, Overwrite<{ [key in A]: RouterT<A, B, C, D> }, Subrouters>, Config>;
}

export const getRootRouter = <Config extends Outer<{}, Config>>(config: Config) => {
  return Router("/", {}).config(config);
};

function Router<CreatedAt extends string, PathParameters = {}, Subrouters = {}>(
  path: CreatedAt,
  parentWsRouter: WebSocketRouter
): RouterT<CreatedAt, PathParameters, Subrouters, unknown> {
  const subrouters: Record<string, any> = {};
  const erpcRouter = ERPCRouter(path, parentWsRouter);

  return {
    // @ts-ignore
    __internal: { subrouters, router: erpcRouter, path },
    getSubroutedAt: () => path,

    sub: <SubroutedAt extends string, Config extends Outer<MergeParams<SubroutedAt, PathParameters>, Config>>(
      subroutedAt: SubroutedAt,
      config: Config
    ) => {
      return Router(subroutedAt, erpcRouter.wsRouter).config(config) as RouterT<
        SubroutedAt,
        MergeParams<SubroutedAt, PathParameters>,
        Subrouters,
        Config
      >;
    },

    mergeRouter: function <A extends string, B, C, D>(subrouter: RouterT<A, B, C, D>) {
      erpcRouter.merge(subrouter.__internal.router);

      return this as RouterT<
        CreatedAt,
        PathParameters,
        Overwrite<{ [key in A]: RouterT<A, B, C, D> }, Subrouters>,
        (typeof this)["__internal"]["config"]
      >;
    },

    config: function <C extends Outer<PathParameters, C>>(config: C) {
      for (const [handlerName, methods] of Object.entries(config)) {
        for (const [method, { __middlewares }] of Object.entries(
          // @ts-ignore
          methods as { [key in HTTPMethodTypes]: FinalizedHandler<unknown, unknown, unknown, unknown> }
        )) {
          if (method === "ws") {
            const { validators, handler } = __middlewares;
            erpcRouter.ws(handlerName, validators, handler);
          } else erpcRouter.expressRouter[method as HTTPMethodTypes](handlerName, __middlewares);
        }
      }

      return this as RouterT<CreatedAt, PathParameters, Subrouters, C>;
    },
  };
}
