import { Overwrite, RouteParameters } from "./RouteParameters";
import { FinalizedHandler, Router as ERPCRouter, RouterT as ERPCRouterT } from "@scinorandex/erpc";

export type HTTPMethodTypes = "get" | "post" | "put" | "patch" | "delete";
type MergeParams<NewPath extends string, ExistingParams> = Overwrite<RouteParameters<NewPath>, ExistingParams>;

type Inner<PathParams, O, HandlerName extends string> = {
  [MethodName in Extract<keyof O, HTTPMethodTypes>]: FinalizedHandler<
    unknown,
    unknown,
    MergeParams<HandlerName, PathParams>,
    unknown
  >;
};

type Outer<PathParams, O> = {
  [HandlerName in keyof O]: Inner<PathParams, O[HandlerName], Extract<HandlerName, string>>;
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
  subroute: <SubroutedAt extends string>(
    subroutedAt: SubroutedAt
  ) => RouterT<SubroutedAt, MergeParams<SubroutedAt, PathParameters>, {}, unknown>;
  mergeRouter: <A extends string, B, C, D>(
    subrouter: RouterT<A, B, C, D>
  ) => RouterT<Path, PathParameters, Overwrite<{ [key in A]: RouterT<A, B, C, D> }, Subrouters>, Config>;

  config: <C extends Outer<PathParameters, C>>(hmm: C) => RouterT<Path, PathParameters, Subrouters, C>;
}

export function Router<CreatedAt extends string, PathParameters = {}, Subrouters = {}>(
  path: CreatedAt
): RouterT<CreatedAt, PathParameters, Subrouters, unknown> {
  const subrouters: Record<string, any> = {};
  const erpcRouter = ERPCRouter(path);

  return {
    // @ts-ignore
    __internal: { subrouters, router: erpcRouter, path },
    getSubroutedAt: () => path,

    subroute: (subroutedAt) => Router(subroutedAt),
    mergeRouter: function <A extends string, B, C, D>(subrouter: RouterT<A, B, C, D>) {
      erpcRouter.merge(subrouter.__internal.router);

      return this as RouterT<
        CreatedAt,
        PathParameters,
        Overwrite<{ [key in A]: RouterT<A, B, C, D> }, Subrouters>,
        typeof this["__internal"]["config"]
      >;
    },

    config: function <C extends Outer<PathParameters, C>>(config: C) {
      for (const [handlerName, methods] of Object.entries(config)) {
        for (const [method, { __middlewares }] of Object.entries(
          methods as { [key in HTTPMethodTypes]: FinalizedHandler<unknown, unknown, unknown, unknown> }
        )) {
          erpcRouter.expressRouter[method as HTTPMethodTypes](handlerName, __middlewares);
        }
      }

      return this as RouterT<CreatedAt, PathParameters, Subrouters, C>;
    },
  };
}
