## RPScin - Fullstack safety over plain rest

### Why not just use tRPC?

Libraries like [tRPC](https://github.com/trpc/trpc/) and [zodios](https://github.com/ecyrbe/zodios) are great for fullstack typesafety without code generation. They, alongside rpscin, (ab)use TypeScript generics to offer a fullstack devleoper experience like no other.

These experiences do come with compromises, tRPC throws away path parameters, and narrows your procedures to only queries and mutations. tRPC models their API closer to what GraphQL does, and with, that limits the use of their tRPC powered servers to only tRPC clients. 

Although it is possible to use libriares like [tRPC-openapi](https://github.com/jlalmes/trpc-openapi) to create a RESTful backend API, it is often easier to begin with one in the first place. RPScin allows users to create a fullstack typesafe API with the middleware and fullstack experience of tRPC while simply being a overglorified wrapper for Express.

### Should I use this over tRPC?

**At this stage, probably not.** While tRPC is also a new technology (note: one that is being used by Netflix), RPScin is 100x newer and 10000x more likely to have bugs. It's very experimental, since that's what it is. It was never made to solve an actual engineering problem, but rather as a hypothetical to see what a typesafe RESTful api would look like.

## OK, I still want to use it. Show me the code!

```ts
// in server.ts
import { baseProcedure } from "@scinorandex/erpc";
import { Router, Server } from "@scinorandex/rpscin";

const unTypeSafeRouter = Router("/").config({
  "/echo": {
    get: baseProcedure.query(z.object({ input: z.string() })).use(async function (req, res, { query }) {
      return { output: query.input };
      //               ^? query: { input: string }
    }),
  },
});

export const appRouter = unTypeSafeRouter;
export type AppRouter = typeof appRouter;

Server({ port: 6666 }, appRouter);
```

The example above is for a server with one endpoint `/echo` which takes in a query parameter `input` and returns a JSON containing an `output` key. if you've used tRPC before, some of this is probably familiar to you. Here's how to fetch it from the client:

```ts
// client.ts
import type { AppRouter } from "./server";
import { Client } from "@scinorandex/rpscin";

const client = Client<AppRouter>({ apiLink: "http://localhost:6666" });
// Prints { output: 'Hello World! '}
client["/echo"].get({ query: { input: "Hello World!" } }).then(console.log);
```

The client has full intellisense and knows the inputs (request body, path parameters, and query parameters) that the endpoint expects.

### Making subrouters

Subrouters need to know the context of their parent, so we "fork" from the parent subrouter. We then merge the subrouter back to its parent to modify the parent router's type definition, which allows the client to know of the subrouter's existence.

```ts
import { z } from "zod";

const userRouter = unTypeSafeRouter.subroute("/user").config({
  "/": {
    post: baseProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .use(async (req, res, { input }) => {
        //                    ^? input: { username: string; password: string }
        return { message: `Created a new user (${input.username})` };
      }),

    get: baseProcedure.query(z.object({ take: z.number().max(20) })).use(async (req, res, { query }) => {
      return { users: [] as { username: string }[] };
    }),
  },

  "/login": {
    post: baseProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .use(async (req, res, { input }) => {
        return { message: `Successfully logged in as (${input.username})` };
      }),
  },
});

export const appRouter = unTypeSafeRouter.mergeRouter(userRouter);
```

The endpoints inside the user router know the path parameters that came before them. When we merge a subrouter back to its parent, the parent's type definition is augmented which allows the client to use the subrouter's procedures.

The user router contains three procedures, two for creating and fetching users, and another for logging in. The register and login endpoints expect a request body containing a `username` and `password` of type `string`.

**Client side**:

```ts
client["/user"]["/"]
  .post({ body: { username: "test_user_username", password: "test_user_password" } })
  .then((res) => console.log(res));
//       ^? res: { message: string }

client["/user"]["/"].get({ query: { take: 4 } }).then((res) => {
  console.log(res);
  //          ^? res: { users: { username: string; }[]; }
});
```

### Nested subrouters and path parameters

```ts
const postRouter = userRouter.subroute("/:user_uuid/post").config({
  "/": {
    get: baseProcedure.query(z.object({ take: z.number(), cursor: z.number() })).use(async (req, res, locals) => {
      return { posts: [] };
    }),

    post: baseProcedure.input(z.object({ content: z.string() })).use(async (req, res, { input }) => {
      return { post: { content: input.content, createdAt: Date.now() } };
    }),
  },

  "/:post_uuid": {
    put: baseProcedure.input(z.object({ new_content: z.string() })).use(async (req, res, { input }) => {
      const params = { ...req.params };
      //    ^? params: { post_uuid: string; user_uuid: string; }
      return { post: { content: input.new_content, uuid: req.params.post_uuid, editedAt: Date.now() } };
    }),
  },
});

export const appRouter = unTypeSafeRouter.mergeRouter(userRouter.mergeRouter(postRouter));
```

The `/:user_uuid/post/:post_uuid` PUT endpoint knows that the request parameters contain the `user_uuid` and `post_uuid` parameters. We merge the post router to the user router *before* merging the user router and the root router.

**Client side**

```ts
client["/user"]["/:user_uuid/post"]["/:post_uuid"]
  .put({
    body: { new_content: "This is the content of the new post" },
    path: { user_uuid: "example_user_uuid", post_uuid: "example_post_uuid" },
  })
  .then((res) => console.log(res));
//       ^? res: { post: { content: string; uuid: string; editedAt: number; } }
```

## What about middleware?

Middleware in RPScin is a lot like middleware in tRPC, as is much of the DX when using the library. We can create a middleware that checks if the cookies contain a key `authToken` of type `string`, which is passed to the next middleware and eventually in the endpont handler.

```ts
const authProcedures = baseProcedure.extend(async (req, res) => {
  if (typeof req.cookies["authToken"] === "string") return { token: req.cookies["authToken"] };
  else throw new Error("An auth token was not found");
});

// Example usage
const userRouter = unTypeSafeRouter.subroute("/user").config({
  "/whoami": {
    get: authProcedures.use(async (req, res, { token }) => {
      //                                       ^? token: string
      return { user: findUserFromToken(token) }
    })
  }
});
```

## Debugging FAQ

**Why is the client calling the wrong endpoint?**

Remember that RPScin uses Express under the hood through [erpc](https://github.com/scinscinscin/erpc). You're still bound to Express' routing, which picks the first matching endpoint even if it is not the best / complete match. The order which your endpoints are registered matters.

**Do queries support nested structures?**

Yes, you can send nested structues through queries using the `__erpc_query` key which expects a base64url encoded JSON string. This is what the RPScin client does to send any query to the server. 

If you're using a plain HTTP client and your query validator is not nested and only contains strings, you can alternatively encode your query params as a plain query string.
