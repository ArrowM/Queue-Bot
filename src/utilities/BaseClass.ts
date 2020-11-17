import { Client } from "discord.js";
import Knex from "knex";

export class BaseClass {
    protected knex: Knex;
    protected client: Client;

    constructor(client: Client, knex: Knex) {
        this.client = client;
        this.knex = knex;
    }
}