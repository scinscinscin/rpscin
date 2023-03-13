import type { HTTPMethodTypes, RouterT } from "./router";
import { Axios } from "axios";
import { ERPCError } from "@scinorandex/erpc/dist/error";

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

export type Serializer = (body: any) => { body: any; headers: Record<string, any> };
interface ClientOptions {
  apiLink: string;
  serializer: Serializer;
  generateHeaders?: () => Record<string, string>;
}

export function Client<Router extends RouterT<string, unknown, unknown, unknown>>(
  opts: ClientOptions
): RouterClientT<Router> {
  const client = new Axios({
    withCredentials: true,
    baseURL: opts.apiLink,
    transformResponse: (x) => JSON.parse(x),
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

        const convertedBody = opts.serializer(body ?? {});
        const headers = { ...(opts.generateHeaders ? opts.generateHeaders() : {}), ...convertedBody.headers };

        return new Promise((resolve, reject) => {
          client[method as HTTPMethodTypes](fullPath, convertedBody.body as any, { headers })
            .then(({ data }) => {
              if (typeof data.success === "boolean") {
                if (data.success && typeof data.result !== "undefined") return resolve(data.result);
                else if (typeof data.error === "string") return reject(new Error(data.error));
                else if (typeof data.error === "object") {
                  const { type: code, message } = data.error;
                  if (code && message) return reject(new ERPCError({ code, message }));
                }
              }

              reject(new Error("Response was not ERPC compliant"));
            })
            .catch((err) => {
              reject(new Error("Failed to connect to server"));
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
