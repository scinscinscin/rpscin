## RPScin - Fullstack TypeSafety over REST

RPScin allows developers to build REST and WebSocket APIs and automatically create type-safe clients without the need for code-generation for a seamless fullstack development experience.

Inspired by [tRPC](https://github.com/trpc/trpc), but with a REST-first architecture. All main HTTP methods are supported, plus WebSocket connections, powered by `@scinorandex/erpc`.

RPScin's benefit comes from the ability to write regular backend code and have input and output types be inferred, as an unbreakable contract with your frontend code.

---

### Getting started

To get started, create a new TypeScript project and install `@scinorandex/rpscin`

Create your entrypoint file and create your root router:
```ts
/**
 * Import the necessary packages
 */
import { Server, createWebSocketEndpoint, getRootRouter } from "@scinorandex/rpscin";
import { baseProcedure, Connection, ERPCError, wsValidate, zodFile } from "@scinorandex/erpc";
import { z } from "zod";

/**
 * This creates a GET endpoint in /echo that requires a query parameter named input
 */
const unTypeSafeRouter = getRootRouter({
  "/echo": {
    get: baseProcedure
      .query(z.object({ input: z.string() }))
      .use(async (req, res, locals) => {
        const query = locals.query;
        return { output: query.input };
        //                 ^? (parameter) query: { input: string };
      }),
  },
});
```

Routers are objects whose keys are path segments, and values are objects that objects that have HTTP methods as keys and endpoint as values. In this case, we're creating a GET endpoint under /echo that returns an object of type `{ output: string }`.

`baseProcedure` is a procedure from `@scinorandex/erpc` that allows us to chain middleware and keep the type context between them. For more information, check out their docs.

We make the endpoint require a `input` query parameter by passing a zod validator to `.query()`, and thus we're given a fully typed `query` object in our endpoint handler's `locals` parameter.

---

**Defining subrouters, and request body types**

Defining subrouters can be done using a router's `.sub()` method. This method accepts the child router's subpath and its config.

```ts
const userRouter = unTypeSafeRouter.sub("/user", {
  /*
  * Create a POST endpoint under /user/login that requires a
  * `username` and `password` field in the request body.
  * Returns a body of type { message: string }.
  */
  "/login": {
    post: baseProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .use(async (req, res, { input }) => {
        return { message: `Successfully logged in as (${input.username})` };
      }),
  },
})
```

---

**Path parameters**

One of the coolest features of RPScin is being able to preserve path parameter context. Endpoints have the entire path context of the router they are defined under, and know which path parameters are defined.

```ts
// Create a subrouter under the userRouter with a path of /:user_uuid/post
const postRouter = userRouter.sub("/:user_uuid/post", {
  // Create a PUT endpoint under /:post_uuid that requires new_content in the request body
  "/:post_uuid": {
    put: baseProcedure
      .input(z.object({ new_content: z.string() }))
      .use(async (req, res, { input }) => {
        /**
        * We can access the request path parameters under req.params
        * and it's fully typed with all the parameters that have been
        * encoded in all the path segments for the endpoint
        */
        const params = { ...req.params };
        //    ^? const params: { post_uuid: strng, user_uuid: string }

        return {
          post: {
            content: input.new_content, uuid: req.params.post_uuid,
            editedAt: Date.now()
          }
        };
      }),
  }
})
```

---

**WebSocket endpoints**

RPScin allows you to define WebSocket endpoints like any other endpoint in your router.

```ts
// Define what your endpoint can emit and maybe create a set that tracks active connections
type Endpoint = {
  Emits: { user_joined: { username: string }; new_message: { contents: string } };
  Receives: { send_message: { contents: string } };
};
const connections: Set<Connection<Endpoint>> = new Set();

{
  /*
    This is in the same object as /:user_uuid/post/:post_uuid
    put:...
  */
  ws: createWebSocketEndpoint(
      // create a websocket validator that validates the data for each event
      wsValidate<Endpoint>({ send_message: z.object({ contents: z.string() }) }),
      // create the actual handler that is called
      async ({ conn, params, query }) => {
                     // ^? const params: { post_uuid: string; user_uuid: string }
        connections.add(conn);

        conn.socket.on("close", () => {
          console.log("WebSocket client has disconnected");
          connections.delete(conn);
        });

        conn.on("send_message", async (data) => {
          for (const connection of connections) {
            connection.emit("new_message", { contents: data.contents });
          }
        });
      }
    ),
}
```

---

**Creating the schema and running the server**

```ts
// This is where you merge all your routers together and form the
// complete typesafe definition of your API
export const appRouter = unTypeSafeRouter.mergeRouter(userRouter.mergeRouter(postRouter));
export type AppRouter = typeof appRouter;

// Start the server and run it on port 6666
// It is possible to run rpscin as a global subroute (Ex: under /api)
// If interested, check erpc docs.
Server({ port: 6666 }, appRouter);
```

Further reading: More information about procedures and validation are available in the [`@scinorandex/erpc` repo](https://github.com/scinscinscin/erpc).

---

**Creating the client**

```ts
// Make sure to only import AppRouter as a type
import type { AppRouter } from "./server";
import { Client, GetInputTypes, GetOutputTypes } from "@scinorandex/rpscin/dist/client";
import { Node } from "@scinorandex/dist/envs/node";
import { Connection } from "@scinorandex/erpc";
import { WebSocket } from "ws";

/**
 * Create the client. This function can be used to generate Node
 * and Browser clients depending on what is passed into `serialized`
 * and `wsClient`. The HTTP Client used isomorphically is axios.
 */
const client = Client<AppRouter, WebSocket>({
  apiLink: "http://localhost:6666",
  wsClient: Node.generateWebSocketClient(`ws://localhost:6666`),
  serializer: Node.serializer,
});

// Get full typesafety when making your requests
// You are required to add every body, query, and path parameter the endpoint needs
client["/echo"]
  .get({ query: { input: "Hello World!" } })
  .then(console.log); // TS knows the return type is { output: string }

client["/user"]["/:user_uuid/post"]["/:post_uuid"]
  .ws({
    path: { user_uuid: "scinorandex", post_uuid: "example_post_uuid" },
  })
  .then((connection) => {
    connection.emit("send_message", {
      contents: "rpscin websocket client is working properly",
    });

    connection.on("new_message", async ({ contents }) => {
      console.log("ECHO Received:", contents);
    });
  });
```

---

### With Next.js

See RPScin being used with Next.js at [ssr](https://github.com/scinscinscin/ssr), a typesafe fullstack metaframework on top of Next.js

---

### Future

These are mostly things that I think are cool to add, but can be solved by other tools or application code.

 - I want to make caching easier by adding it to the middleware layer, maybe as a `.cache()` method where you define a key from the request that is used to cache and save requests
 - I want to add a way to underfetch data from the API like GraphQL, the client can pass an object that is a subset of the return type of the API, and the API would only return what the user asked for that it can provide.
 - Currently, you're constrained to only returning JSON, it would be neat to support binary blobs if possible.
 - Possibly move off of Express and allow for use with other libraries like Fastify or Hono.
