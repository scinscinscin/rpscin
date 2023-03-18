import type { AppRouter } from "./server";
import { Client, GetInputTypes, GetOutputTypes } from "../src/index";
import { Node } from "../src/envs/node";
import fs from "fs";
import path from "path";

type Inputs = GetInputTypes<AppRouter>;
type Outputs = GetOutputTypes<AppRouter>;

const client = Client<AppRouter>({
  apiLink: "http://localhost:6666",
  serializer: Node.serializer,
});

client["/echo"].get({ query: { input: "Hello World!" } }).then(console.log);

client["/user"]["/"]
  .post({ body: { username: "test_user_username", password: "test_user_password" } })
  .then((res) => console.log(res))
  //       ^?
  .catch((err) => console.log(err));

client["/user"]["/"]
  .post({ body: { username: "scinorandex", password: "test_user_password" } })
  .then((res) => console.log(res))
  //       ^?
  .catch((err) => console.log("Expected error: ", err));

client["/user"]["/"].get({ query: { take: 4 } }).then((res) => {
  console.log(res);
  //          ^?
});

client["/user"]["/:user_uuid/post"]["/:post_uuid"]
  .put({
    body: { new_content: "This is the content of the new post" },
    path: { user_uuid: "example_user_uuid", post_uuid: "example_post_uuid" },
  })
  .then((res) => console.log(res));
//       ^?

const image = Node.wrapFile("image/png", fs.createReadStream(path.resolve(__dirname, "./tux.png")));
client["/user"]["/image_upload"]
  .put({ body: { username: ["scinorandex", "another_username"], image } })
  .then((res) => console.log(res));
//        ^?
