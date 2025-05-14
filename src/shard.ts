import { Client } from "./client/client.ts";
import { Db } from "./db/db.ts";
import { NodeListeners } from "./listeners/node.listeners.ts";

NodeListeners.load();

Db.printLoadMessage();

// Modified to catch errors properly
Client.start().catch(error => {
	console.error(`[Shard] Failed to start:`, error);
	process.exit(1);
});