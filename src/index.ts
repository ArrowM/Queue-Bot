// 1. Load signal handlers
// 3. Start client
import * as Client from "./client/CLIENT.ts";
// 2. Load database connection
import * as DB from "./db/db.ts";
import * as NodeSignalHandler from "./listeners/node.listeners.ts";

NodeSignalHandler.load();

DB.load();

Client.start();
