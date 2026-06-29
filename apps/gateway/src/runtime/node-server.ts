import "dotenv/config";
import { loadConfig } from "./config";
import { createNodeServer } from "./create-node-server";

const config = loadConfig();
const server = await createNodeServer(config);

server.listen(config.port, () => {
  console.log(`open-realtime listening on http://localhost:${config.port}`);
});

export default server;
