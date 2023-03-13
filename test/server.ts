import { Router, Server } from "../src/index";
import { baseProcedure, ERPCError, zodFile } from "@scinorandex/erpc";
import { z } from "zod";

const authProcedures = baseProcedure.extend(async (req, res) => {
  if (typeof req.cookies["authToken"] === "string") return { token: req.cookies["authToken"] };
  else throw new Error("An auth token was not found");
});

const unTypeSafeRouter = Router("/").config({
  "/echo": {
    get: baseProcedure.query(z.object({ input: z.string() })).use(async (req, res, { query }) => {
      return { output: query.input };
      //                 ^?
    }),
  },
});

const userRouter = unTypeSafeRouter.subroute("/user").config({
  "/": {
    post: baseProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .use(async (req, res, { input }) => {
        //                     ^?
        if (input.username.startsWith("test_user")) return { message: `Created a new user (${input.username})` };
        else
          throw new ERPCError({
            code: "UNAUTHORIZED",
            message: `Expected username to start with test_user, received ${input.username}`,
          });
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

  "/whoami": {
    get: baseProcedure.use(async (req, res, {}) => {
      throw new ERPCError({ code: "BAD_REQUEST", message: "you got unlucky" });
      return { username: "scinorandex" };
    }),
  },

  "/image_upload": {
    put: baseProcedure
      .input(
        z.object({
          username: z.array(z.string()),
          image: zodFile("image/png"),
        })
      )
      .use(async (req, res, { input }) => {
        console.log(input);
        //               ^?
        return true;
      }),
  },
});

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
      //    ^?
      return { post: { content: input.new_content, uuid: req.params.post_uuid, editedAt: Date.now() } };
    }),
  },
});

export const appRouter = unTypeSafeRouter.mergeRouter(userRouter.mergeRouter(postRouter));
export type AppRouter = typeof appRouter;

Server({ port: 6666 }, appRouter);
