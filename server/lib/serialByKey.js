// Runs tasks one at a time per key, in the order they were queued; different
// keys run side by side. One process only: a second server instance would
// need a lock in the database instead.
export function serialByKey() {
  const tails = new Map();

  return function run(key, task) {
    const result = (tails.get(key) ?? Promise.resolve()).then(task);
    const tail = result.catch(() => {});
    tails.set(key, tail);
    tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
}
