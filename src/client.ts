import type { HTTPMethodTypes, RouterT } from "./router";
import { Axios } from "axios";

type isEmptyObject<T, EmptyValue, ContainsValue> = {} extends T ? EmptyValue : ContainsValue;
type EndpointParamsBuilder<T extends { body_params: unknown; path_parameters: unknown; query_parameters: unknown }> =
  (T["body_params"] extends {} ? { body: T["body_params"] } : {}) &
    (T["path_parameters"] extends {} ? isEmptyObject<T["path_parameters"], {}, { path: T["path_parameters"] }> : {}) &
    (T["query_parameters"] extends {} ? { query: T["query_parameters"] } : {});

type RouterClientT<Router extends RouterT<string, unknown, unknown, unknown>> = {
  [subrouterName in keyof Router["__internal"]["subrouters"]]: RouterClientT<
    // @ts-ignore
    Router["__internal"]["subrouters"][subrouterName]
  >;
} & {
  [handlerName in keyof Router["__internal"]["config"]]: {
    [methodName in keyof Router["__internal"]["config"][handlerName]]: (
      // @ts-ignore
      p: EndpointParamsBuilder<Router["__internal"]["config"][handlerName][methodName]["__internal_reflection"]>
      // @ts-ignore
    ) => Promise<Router["__internal"]["config"][handlerName][methodName]["__internal_reflection"]["return_type"]>;
  };
} & { [key: string]: unknown };

interface ClientOptions {
  apiLink: string;
}

export function Client<Router extends RouterT<string, unknown, unknown, unknown>>({
  apiLink,
}: ClientOptions): RouterClientT<Router> {
  const client = new Axios({
    withCredentials: true,
    baseURL: apiLink,
    transformResponse: (x) => JSON.parse(x),
    headers: { "Content-Type": "application/json" },
  });

  function Proxify(pathSegments: string[]): {} {
    return new Proxy(() => {}, {
      apply(target, thisArg, [{ path, query, body }]) {
        const method = pathSegments.pop();

        let fullPath = pathSegments.join("");
        for (const [pathParamKey, pathParamValue] of Object.entries((path as Record<string, string>) ?? {})) {
          fullPath = fullPath.replaceAll(`:${pathParamKey}`, pathParamValue);
        }

        if (typeof query === "object") {
          const queryString = Buffer.from(JSON.stringify(query)).toString("base64url");
          fullPath += `?__erpc_query=${queryString}`;
        }

        return new Promise((resolve) => {
          client[method as HTTPMethodTypes](fullPath, JSON.stringify(body ?? {})).then(({ data }) => {
            resolve(data.result);
          });
        });
      },

      get(target, prop, receiver) {
        if (typeof prop === "string") return Proxify([...pathSegments, prop]);
        else
          throw new Error("prop MUST be a string. This error should not occur if you're following typescript properly");
      },
    });
  }

  // @ts-ignore
  return Proxify([]);
}
