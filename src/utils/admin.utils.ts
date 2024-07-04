import { type GuildMember, PermissionsBitField, Role } from "discord.js";
import { compact } from "lodash-es";

import { db } from "../db/db.ts";
import type { Store } from "../db/store.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { AdminAccessError } from "./error.utils.ts";

export namespace AdminUtils {
	export function insertAdmins(store: Store, mentionables: Mentionable[]) {
		return db.transaction(() => compact(
			mentionables.map(mentionable =>
				store.insertAdmin({
					guildId: store.guild.id,
					subjectId: mentionable.id,
					isRole: mentionable instanceof Role,
				})
			)
		));
	}

	export function deleteAdmins(store: Store, adminIds: bigint[]) {
		return compact(adminIds.map(adminId => store.deleteAdmin({ id: adminId })));
	}

	export function isAdmin(store: Store, member: GuildMember) {
		const isDiscordAdmin = () => member.permissions.has(PermissionsBitField.Flags.Administrator);
		const isBotAdmin = () => store.dbAdmins().some(admin =>
			admin.isRole ? member.roles.cache.has(admin.subjectId) : admin.subjectId === member.id
		);
		return isDiscordAdmin() || isBotAdmin();
	}

	export function verifyIsAdmin(store: Store, member: GuildMember) {
		if (!isAdmin(store, member)) {
			throw new AdminAccessError();
		}
	}
}