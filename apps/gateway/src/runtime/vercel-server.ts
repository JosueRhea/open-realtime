import "dotenv/config";
import { loadConfig } from "./config";
import { createNodeServer } from "./create-node-server";

export default await createNodeServer(loadConfig());
