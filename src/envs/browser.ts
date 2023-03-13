import type { FileWrapper } from "@scinorandex/erpc";

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
