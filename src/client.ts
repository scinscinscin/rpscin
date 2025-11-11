import type { HTTPMethodTypes, RouterT } from "./router";
import { Axios, AxiosInstance, AxiosRequestConfig } from "axios";
import { ERPCError } from "@scinorandex/erpc/dist/error";

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

export interface WebSocketConnection<
  Params extends { Emits: { [key: string]: any }; Receives: { [key: string]: any } },
  SocketImpl
> {
  socket: SocketImpl;
  emit<T extends keyof Params["Emits"]>(eventName: T, data: Params["Emits"][T]): void;
  on<T extends keyof Params["Receives"]>(eventName: T, handler: (data: Params["Receives"][T]) => Promise<void>): void;
}

export class CancellablePromise<T> extends Promise<T> {
  constructor(t: (resolve: (data: T) => void, reject: (reason: any) => void) => void, close: () => void) {
    super(t);
    this.close = close;
  }
  public close: () => void;
}

type GetSubrouters<Router extends { __internal: { subrouters: unknown } }> = Router["__internal"]["subrouters"];
type GetRouterConfig<Router extends { __internal: { config: unknown } }> = Router["__internal"]["config"];
type GetEndpointMetadata<
  Router extends { __internal: { config: { [key: string]: { [key: string]: { __internal_reflection: unknown } } } } },
  handlerName extends keyof GetRouterConfig<Router>,
  methodName extends keyof GetRouterConfig<Router>[handlerName]
> = GetRouterConfig<Router>[handlerName][methodName]["__internal_reflection"];

type RouterClientT<Router extends RouterT<string, unknown, unknown, unknown>, SocketImpl> = {
  [subrouterName in keyof GetSubrouters<Router>]: RouterClientT<
    // @ts-ignore
    GetSubrouters<Router>[subrouterName],
    SocketImpl
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
        ws: (
          // @ts-ignore
          p: Pick<EndpointParamsBuilder<GetEndpointMetadata<Router, handlerName, "ws">>, "path">
        ) => CancellablePromise<
          WebSocketConnection<
            // @ts-ignore
            {
              // @ts-ignore
              Emits: GetEndpointMetadata<Router, handlerName, "ws">["body_params"];
              // @ts-ignore
              Receives: GetEndpointMetadata<Router, handlerName, "ws">["return_type"];
            },
            SocketImpl
          >
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

export type WebSocketClient<SocketImpl> = (link: string) => CancellablePromise<WebSocketConnection<any, SocketImpl>>;

export type Serializer = (body: any) => { body: any; headers: Record<string, any> };
interface ClientOptions<SocketImpl> {
  apiLink: string;
  wsClient: WebSocketClient<SocketImpl>;
  serializer: Serializer;
  generateHeaders?: () => Record<string, string>;
  createAxiosInstance?: (opts: AxiosRequestConfig) => AxiosInstance;
}

export function Client<Router extends RouterT<string, unknown, unknown, unknown>, SocketImpl>(
  opts: ClientOptions<SocketImpl>
): RouterClientT<Router, SocketImpl> {
  const httpClient = (opts.createAxiosInstance ?? ((config) => new Axios(config)))({
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
                else {
                  const error = generateErrorFromResponse(data);
                  if (error) return reject(error);
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

export const generateErrorFromResponse = (data: any) => {
  if (typeof data.error === "string") return new Error(data.error);
  else if (typeof data.error === "object") {
    const { type: code, message } = data.error;
    if (code && message) return new ERPCError({ code, message });
  }

  return null;
};
