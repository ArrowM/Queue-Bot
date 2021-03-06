import { Collection, LimitedCollection, Message } from "discord.js";
import { Base } from "./Base";

/**
 * This Message cache only caches messages from this bot
 **/
export class MessageCollection<K, V> extends LimitedCollection<K, V> {
   constructor(maxSize = 0, iterable: any = null) {
      super(iterable);
      this.maxSize = maxSize;
   }

   public set(key: any, value: any) {
      const msg = value as Message;
      if (msg?.author?.id && msg.author.id !== Base.getClient().user.id) return this;
      if (this.maxSize === 0) return this;
      if (this.size >= this.maxSize && !this.has(key)) this.delete(this.firstKey());
      return super.set(key, value);
   }

   public static get() {
      return Collection;
   }
}
