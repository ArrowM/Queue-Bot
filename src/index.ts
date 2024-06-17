import { Client } from "./client/client.ts";
import { Db } from "./db/db.ts";
import { NodeListeners } from "./listeners/node.listeners.ts";

NodeListeners.load();

Db.printLoadMessage();

Client.start();
