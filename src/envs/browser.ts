import type { FileWrapper } from "@scinorandex/erpc";
import { CancellablePromise, WebSocketClient, generateErrorFromResponse } from "src/client";

const isPlainObject = (value: any) => value?.constructor === Object;

export const Browser = {
  serializer(unparsedBody: any) {
    const convertedBody = serialize(unparsedBody);
    return {
      body: convertedBody.body,
      headers: {
        "Content-Type": convertedBody.type === "json" ? "application/json" : undefined,
      },
    };
  },

  wrapFile<T extends string>(mime: T | T[], innerFile: File): FileWrapper<T> {
    if (typeof mime === "string" && innerFile.type === mime) return innerFile as FileWrapper<T>;
    else if (typeof mime === "object" && mime.includes(innerFile.type as T)) return innerFile as FileWrapper<T>;
    else throw new Error("Incompatible mimetype between server and client, not sending");
  },

  generateWebSocketClient(domain: string): (path: string) => ReturnType<WebSocketClient<WebSocket>> {
    return (path: string) => {
      const ws = new WebSocket(`${domain}${path}`);
      const eventHandlerMap = new Map();

      return new CancellablePromise(
        (resolve, reject) => {
          ws.addEventListener("message", ({ data: stringified }) => {
            if (stringified === "@scinorandex/erpc -- stabilize") {
              resolve({
                socket: ws,
                emit: (eventName, data: any) => ws.send(JSON.stringify({ eventName, data })),
                on: (eventName, handler: (data: any) => void) => eventHandlerMap.set(eventName, handler),
              });
            } else {
              const { eventName, data } = JSON.parse(stringified);
              if (eventHandlerMap.has(eventName)) eventHandlerMap.get(eventName)(data);
            }
          });

          ws.addEventListener("close", (closeEvent) => {
            try {
              const response = JSON.parse(closeEvent.reason.toString());
              const error = generateErrorFromResponse(response);
              if (error) reject(error);
              else reject(new Error("Response was not ERPC Compliant"));
            } catch (err) {}
          });
        },
        () => ws.close()
      );
    };
  },
};

function serialize(body: any, prefix = [] as string[], ctx = { fd: new FormData(), isJSON: true }) {
  if (typeof body !== "object") {
    ctx.fd.append(prefix.join("."), String(body).toString());
  } else {
    if (isPlainObject(body)) {
      // regular object
      Object.entries(body).forEach(([key, value]) => {
        serialize(value, [...prefix, key], ctx);
      });
    } else if (Array.isArray(body)) {
      body.forEach((item, index) => {
        serialize(item, [...prefix, `${index}`], ctx);
      });
    } else {
      ctx.fd.append(prefix.join("."), body);
      ctx.isJSON = false;
    }
  }

  if (ctx.isJSON) return { type: "json", body: JSON.stringify(body) };
  else return { type: "form", body: ctx.fd };
}
