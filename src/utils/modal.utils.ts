export namespace ModalUtils {
	export function encodeCustomId(modalId: string, queueId: bigint) {
		return `${modalId}:${queueId}`;
	}

	export function decodeCustomId(customId: string) {
		const [modalId, queueId] = customId.split(":");
		return { modalId, queueId: BigInt(queueId) };
	}
}