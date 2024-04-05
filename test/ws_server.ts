import { Server, createWebSocketEndpoint, getRootRouter } from "../src/index";
import { Connection, wsValidate } from "@scinorandex/erpc";
import { z } from "zod";

const unTypeSafeRouter = getRootRouter({});
const connections: Connection<Endpoint>[] = [];

type Endpoint = {
  Emits: { user_joined: { username: string }; new_message: { contents: string } };
  Receives: { send_message: { contents: string } };
};

const userRouter = unTypeSafeRouter.sub("/user", {
  "/:user_uuid/dm": {
    ws: createWebSocketEndpoint(
      wsValidate<Endpoint>({ send_message: z.object({ contents: z.string() }) }),
      async ({ conn, params, query }) => {
        console.log("New websocket request received");
        console.log("Params: ", params);
        connections.push(conn);

        conn.on("send_message", (data) => {
          for (const connection of connections) {
            connection.emit("new_message", { contents: data.contents });
          }
        });
      }
    ),
  },
});

export const appRouter = unTypeSafeRouter.mergeRouter(userRouter);
export type AppRouter = typeof appRouter;

Server({ port: 6666 }, appRouter);
