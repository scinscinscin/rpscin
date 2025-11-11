import type { AppRouter } from "./ws_server";
import { Client } from "../src/index";
import { Node } from "../src/envs/node";
import { WebSocket } from "ws";

const client = Client<AppRouter, WebSocket>({
  apiLink: "http://localhost:6666",
  wsClient: Node.generateWebSocketClient(`ws://localhost:6666`),
  serializer: Node.serializer,
});

async function blocking() {
  try {
    const connection = await client["/user"]["/:user_uuid/dm"].ws({ path: { user_uuid: "scinorandex" } });
    connection.emit("send_message", { contents: "rpscin websocket client is working properly" });
    connection.on("new_message", async ({ contents }) => {
      console.log("ECHO Received:", contents);
      connection.socket.close();
    });
  } catch (err) {
    console.log("failed to initialize websocket connection:", err);
  }
}

function nonblocking() {
  const subscription = client["/user"]["/:user_uuid/dm"].ws({ path: { user_uuid: "scinorandex" } });
  subscription.then((connection) => {
    connection.emit("send_message", {
      contents: "rpscin websocket client is working properly",
    });

    connection.on("new_message", async ({ contents }) => {
      console.log("ECHO Received:", contents);
      subscription.close();
    });
  });

  subscription.catch((err) => {
    console.log("failed to initialize websocket connection:", err);
  });
}

nonblocking();
