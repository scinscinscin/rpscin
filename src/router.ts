import { Overwrite, RouteParameters } from "./RouteParameters";
import { FinalizedHandler, Router as ERPCRouter, RouterT as ERPCRouterT } from "@scinorandex/erpc";

export type HTTPMethodTypes = "get" | "post" | "put" | "patch" | "delete";

type MergeParams<NewPath extends string, ExistingParams> = Overwrite<RouteParameters<NewPath>, ExistingParams>;

type Inner<PathParams, MethodsObject, HandlerName extends string> = {
  [MethodName in Extract<keyof MethodsObject, HTTPMethodTypes>]: FinalizedHandler<
    unknown,
    unknown,
    MergeParams<HandlerName, PathParams>,
    unknown
  >;
};

type Outer<PathParams, Config> = {
  [HandlerName in keyof Config]: Inner<PathParams, Omit<Config[HandlerName], "ws">, Extract<HandlerName, string>> & {
    ws?: string;
  };
};

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
  return Router("/").config(config);
};

export function Router<CreatedAt extends string, PathParameters = {}, Subrouters = {}>(
  path: CreatedAt
): RouterT<CreatedAt, PathParameters, Subrouters, unknown> {
  const subrouters: Record<string, any> = {};
  const erpcRouter = ERPCRouter(path);

  return {
    // @ts-ignore
    __internal: { subrouters, router: erpcRouter, path },
    getSubroutedAt: () => path,

    sub: <SubroutedAt extends string, Config extends Outer<MergeParams<SubroutedAt, PathParameters>, Config>>(
      subroutedAt: SubroutedAt,
      config: Config
    ) => {
      return Router(subroutedAt).config(config) as RouterT<
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
          if (method != "ws") {
            erpcRouter.expressRouter[method as HTTPMethodTypes](handlerName, __middlewares);
          }
        }
      }

      return this as RouterT<CreatedAt, PathParameters, Subrouters, C>;
    },
  };
}
