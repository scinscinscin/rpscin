import type { AppRouter } from "./ws_client";
import { Client } from "../src/index";
import { Node } from "../src/envs/node";

const client = Client<AppRouter>({
  apiLink: "http://localhost:6666",
  wsClient: Node.generateWebSocketClient(`ws://localhost:6666`),
  serializer: Node.serializer,
});

client["/user"]["/:user_uuid/dm"].ws({ path: { user_uuid: "scinorandex" } }).then((connection) => {
  connection.emit("send_message", {
    contents: "rpscin websocket client is working properly",
  });

  connection.on("new_message", ({ contents }) => {
    console.log("ECHO Received:", contents);
  });
});
