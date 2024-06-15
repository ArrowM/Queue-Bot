import { Events } from "discord.js";

import { CLIENT } from "../client/CLIENT.ts";
import { ClientHandler } from "../handlers/client.handler.ts";
import { InteractionHandler } from "../handlers/interaction.handler.ts";

export namespace ClientListeners {
	export function load() {
		CLIENT.on(Events.GuildDelete, ClientHandler.handleGuildDelete);

		CLIENT.on(Events.InteractionCreate, inter => new InteractionHandler(inter).handle());

		CLIENT.on(Events.GuildRoleDelete, ClientHandler.handleRoleDelete);

		CLIENT.on(Events.GuildMemberRemove, ClientHandler.handleGuildMemberRemove);

		CLIENT.on(Events.ChannelDelete, ClientHandler.handleChannelDelete);

		CLIENT.on(Events.VoiceStateUpdate, ClientHandler.handleVoiceStateUpdate);
	}
}