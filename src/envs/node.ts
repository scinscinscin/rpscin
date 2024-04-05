import FormData from "form-data";
import { ERPCError, type FileWrapper } from "@scinorandex/erpc";
import { generateErrorFromResponse, type WebSocketClient } from "../client";
import type fs from "fs";
import WebSocket from "ws";

const isPlainObject = (value: any) => value?.constructor === Object;

export const Node = {
  serializer(unparsedBody: any) {
    const convertedBody = serialize(unparsedBody);
    if (convertedBody.type === "json") {
      return {
        body: convertedBody.body,
        headers: { "Content-Type": "application/json" },
      };
    }

    return {
      body: convertedBody.body,
      headers: convertedBody.body.getHeaders(),
    };
  },

  generateWebSocketClient(domain: string): (path: string) => ReturnType<WebSocketClient> {
    return (path: string) => {
      const ws = new WebSocket(`${domain}${path}`, {});

      return new Promise((resolve, reject) => {
        const eventHandlerMap = new Map<string, any>();

        ws.on("open", () => {
          ws.on("message", (wsData) => {
            const stringified = wsData.toString();

            if (stringified === "@scinorandex/erpc -- stabilize") {
              resolve({
                emit: (eventName: string, data: any) => ws.send(JSON.stringify({ eventName, data })),
                on: (eventName: string, handler: (data: any) => void) => eventHandlerMap.set(eventName, handler),
              });
            } else {
              const { eventName, data } = JSON.parse(wsData.toString());
              if (eventHandlerMap.has(eventName)) eventHandlerMap.get(eventName)(data);
            }
          });
        });

        ws.on("close", (data, reason) => {
          try {
            const response = JSON.parse(reason.toString());
            const error = generateErrorFromResponse(response);
            if (error) reject(error);
            else reject(new Error("Response was not ERPC Compliant"));
          } catch (err) {}
        });
      });
    };
  },

  wrapFile<T extends string>(mime: T | T[], innerFile: fs.ReadStream): FileWrapper<T> {
    // it would be best to validate the mime-type of the file here, but there is no reliable way of doing that
    return innerFile as unknown as FileWrapper<T>;
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

  if (ctx.isJSON) return { type: "json" as const, body: JSON.stringify(body) };
  else return { type: "form" as const, body: ctx.fd };
}
