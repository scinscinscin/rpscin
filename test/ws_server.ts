import { Server, createWebSocketEndpoint, getRootRouter } from "../src/index";
import { Connection, ERPCError, wsValidate } from "@scinorandex/erpc";
import { z } from "zod";

const unTypeSafeRouter = getRootRouter({});
const connections: Set<Connection<Endpoint>> = new Set();

type Endpoint = {
  Emits: { user_joined: { username: string }; new_message: { contents: string } };
  Receives: { send_message: { contents: string } };
};

const userRouter = unTypeSafeRouter.sub("/user", {
  "/:user_uuid/dm": {
    ws: createWebSocketEndpoint(
      wsValidate<Endpoint>({ send_message: z.object({ contents: z.string() }) }),
      async ({ conn, params, query }) => {
        if (params.user_uuid !== "scinorandex") {
          throw new ERPCError({ code: "UNAUTHORIZED", message: "You are not scinorandex" });
        }

        console.log("New websocket request received. Parmeters:", params);
        connections.add(conn);

        conn.on("send_message", async (data) => {
          if (data.contents === "error") {
            throw new Error("I was told to throw an error");
          }

          for (const connection of connections) {
            connection.emit("new_message", { contents: data.contents });
          }
        });

        conn.socket.on("close", () => {
          connections.delete(conn);
          console.log("Client has disconnected, remaining connections: ", connections);
        });
      }
    ),
  },
});

export const appRouter = unTypeSafeRouter.mergeRouter(userRouter);
export type AppRouter = typeof appRouter;

Server({ port: 6666 }, appRouter);
