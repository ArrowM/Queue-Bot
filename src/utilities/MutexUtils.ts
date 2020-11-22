import { Mutex, MutexInterface } from "async-mutex";

export class MutexUtils {
   public static getMemberLock(queueChannelId: string): MutexInterface {
      return this.getLock(this.memberLocks, queueChannelId);
   }

   private static memberLocks = new Map<string, MutexInterface>(); // Map<QueueGuild id, MutexInterface>;

   private static getLock(map: Map<string, MutexInterface>, key: string): MutexInterface {
      let lock = map.get(key);
      if (!lock) {
         lock = new Mutex();
         map.set(key, lock);
      }
      return lock;
   }
}
