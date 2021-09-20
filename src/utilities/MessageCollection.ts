import { LimitedCollection, Message } from "discord.js";
import { Base } from "./Base";

/**
 * This message cache only caches messages from this bot
 **/
export class MessageCollection<K, V> extends LimitedCollection<K, V> {
  public set(key: any, value: any) {
    const msg = value as Message;
    if (msg?.author?.id && msg.author.id !== Base.client.user.id) return this;
    if (this.maxSize === 0) return this;
    if (this.size >= this.maxSize && !this.has(key)) {
      for (const [k, v] of this.entries()) {
        const keep = this.keepOverLimit?.(v, k, this) ?? false;
        if (!keep) {
          this.delete(k);
          break;
        }
      }
    }
    return super.set(key, value);
  }
}
