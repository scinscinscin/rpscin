import type { FileWrapper } from "@scinorandex/erpc";
import { CancellablePromise, type WebSocketClient, generateErrorFromResponse } from "../client";

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

function serialize(value: any, path: string[] = [], ctx = { files: [] as any[], items: [] as any[] }): any {
  if (typeof value !== "object" || value === null) ctx.items.push([path.join("."), value]);
  else if (Array.isArray(value)) value.forEach((item, index) => serialize(item, [...path, `${index}`], ctx));
  else if (isPlainObject(value)) Object.entries(value).forEach(([key, value]) => serialize(value, [...path, key], ctx));
  else ctx.files.push([path.join("."), value]);

  if (ctx.files.length == 0) return { type: "json", body: JSON.stringify(value) };

  const fd = new FormData();
  fd.append("__erpc_body", JSON.stringify(ctx.items));
  ctx.files.forEach(([key, value]) => fd.append(key, value));
  return { type: "form", body: fd };
}
