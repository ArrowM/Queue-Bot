import { Collection, type GuildMember, type Snowflake } from "discord.js";

import type { ArrayOrCollection } from "../types/misc.types.ts";


export function toCollection<K, V>(property: string | number, list: V[]) {
	return new Collection<K, V>(list.map(item => [(item as any)[property] as K, item]));
}

export function toChoices(coll: ({ [key: string | number]: any }) | any[]) {
	return Object.values(coll).map((value) => ({ name: value, value }));
}

export function size<T>(items: ArrayOrCollection<any, T>): number {
	return ((items instanceof Collection) ? items?.size : items?.length) ?? 0;
}

export function map<T, S>(items: ArrayOrCollection<any, T>, fn: (queue: T) => S): S[] {
	return (items instanceof Collection) ? items.map(fn) : items.map(fn);
}

export function find<T>(items: ArrayOrCollection<any, T>, fn: (queue: T) => boolean): T {
	return (items instanceof Collection) ? items.find(fn) : items.find(fn);
}

export function filterDbObjectsOnJsMember<T extends {
	subjectId: Snowflake,
	isRole: boolean
}>(dbObjects: Collection<bigint, T>, jsMember: GuildMember) {
	return dbObjects.filter(dbObj => {
		if (dbObj.isRole) {
			return Array.isArray(jsMember.roles)
				? jsMember.roles.some(role => role.id === dbObj.subjectId)
				: jsMember.roles.cache.has(dbObj.subjectId);
		}
		else {
			return dbObj.subjectId === jsMember.id;
		}
	});
}

// Convert a value to a BigInt, or return null if it fails
export function BigIntSafe(value: any) {
	try {
		return BigInt(value);
	}
	catch {
		return null;
	}
}