import type { HTTPMethodTypes, RouterT } from "./router";
import { Axios } from "axios";
import { ERPCError } from "@scinorandex/erpc/dist/error";
import { Connection } from "@scinorandex/erpc";

type isEmptyObject<T, EmptyValue, ContainsValue> = {} extends T ? EmptyValue : ContainsValue;
type EndpointParamsBuilder<T extends { body_params: unknown; path_parameters: unknown; query_parameters: unknown }> =
  (T["body_params"] extends {} ? { body: T["body_params"] } : {}) &
    (T["path_parameters"] extends {} ? isEmptyObject<T["path_parameters"], {}, { path: T["path_parameters"] }> : {}) &
    (T["query_parameters"] extends {} ? { query: T["query_parameters"] } : {});

/**
 * Dear programmer
 * When i wrote this code, only god and I knew how it worked.
 * Now, only God knows it!
 *
 * Therefore, if you are trying to optimize these types and it fails (most surely)
 * please increase this counter as a warning for the next person:
 */
type FuckMyLifeCounter = 1;

type GetSubrouters<Router extends { __internal: { subrouters: unknown } }> = Router["__internal"]["subrouters"];
type GetRouterConfig<Router extends { __internal: { config: unknown } }> = Router["__internal"]["config"];
type GetEndpointMetadata<
  Router extends { __internal: { config: { [key: string]: { [key: string]: { __internal_reflection: unknown } } } } },
  handlerName extends keyof GetRouterConfig<Router>,
  methodName extends keyof GetRouterConfig<Router>[handlerName]
> = GetRouterConfig<Router>[handlerName][methodName]["__internal_reflection"];

type RouterClientT<Router extends RouterT<string, unknown, unknown, unknown>> = {
  [subrouterName in keyof GetSubrouters<Router>]: RouterClientT<
    // @ts-ignore
    GetSubrouters<Router>[subrouterName]
  >;
} & {
  [handlerName in keyof GetRouterConfig<Router>]: {
    [methodName in keyof Omit<GetRouterConfig<Router>[handlerName], "ws">]: (
      // @ts-ignore
      p: EndpointParamsBuilder<GetEndpointMetadata<Router, handlerName, methodName>>
      // @ts-ignore
    ) => Promise<GetEndpointMetadata<Router, handlerName, methodName>["return_type"]>;
  } & ("ws" extends keyof GetRouterConfig<Router>[handlerName]
    ? {
        // @ts-ignore
        ws: (p: Pick<EndpointParamsBuilder<GetEndpointMetadata<Router, handlerName, "ws">>, "path">) => Promise<
          // @ts-ignore
          Connection<{
            // @ts-ignore
            Emits: GetEndpointMetadata<Router, handlerName, "ws">["body_params"];
            // @ts-ignore
            Receives: GetEndpointMetadata<Router, handlerName, "ws">["return_type"];
          }>
        >;
      }
    : {});
} & { [key: string]: unknown };

export type GetInputTypes<Router extends RouterT<string, unknown, unknown, unknown>> = {
  [subrouterName in keyof GetSubrouters<Router>]: GetInputTypes<
    // @ts-ignore
    GetSubrouters<Router>[subrouterName]
  >;
} & {
  [handlerName in keyof GetRouterConfig<Router>]: {
    [methodName in keyof GetRouterConfig<Router>[handlerName]]: EndpointParamsBuilder<
      // @ts-ignore
      GetEndpointMetadata<Router, handlerName, methodName>
    >;
  };
} & { [key: string]: unknown };

export type GetOutputTypes<Router extends RouterT<string, unknown, unknown, unknown>> = {
  [subrouterName in keyof GetSubrouters<Router>]: GetOutputTypes<
    // @ts-ignore
    GetSubrouters<Router>[subrouterName]
  >;
} & {
  [handlerName in keyof GetRouterConfig<Router>]: {
    // @ts-ignore
    // prettier-ignore
    [methodName in keyof GetRouterConfig<Router>[handlerName]]: GetEndpointMetadata<Router, handlerName, methodName>["return_type"];
  };
} & { [key: string]: unknown };

export type WebSocketClient = (link: string) => Promise<{
  on(eventName: string, handler: (d: any) => void): void;
  emit(eventName: string, data: any): void;
}>;

export type Serializer = (body: any) => { body: any; headers: Record<string, any> };
interface ClientOptions {
  apiLink: string;
  wsClient: WebSocketClient;
  serializer: Serializer;
  generateHeaders?: () => Record<string, string>;
}

export function Client<Router extends RouterT<string, unknown, unknown, unknown>>(
  opts: ClientOptions
): RouterClientT<Router> {
  const httpClient = new Axios({
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

        if (method === "ws") return opts.wsClient(fullPath);

        if (typeof query === "object") {
          const queryString = Buffer.from(JSON.stringify(query)).toString("base64url");
          fullPath += `?__erpc_query=${queryString}`;
        }

        const convertedBody = opts.serializer(body ?? {});
        const headers = { ...(opts.generateHeaders ? opts.generateHeaders() : {}), ...convertedBody.headers };

        return new Promise((resolve, reject) => {
          httpClient[method as HTTPMethodTypes](fullPath, convertedBody.body as any, { headers })
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
