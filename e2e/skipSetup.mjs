// Most scripts start where a set-up restaurant does: past the setup, with the
// one-time "keep a copy safe" card put away. setup.mjs covers both.
export async function skipSetup(page, url) {
  await page.goto(url);
  await page.getByText("Keep your restaurant safe").waitFor();
  await page.evaluate(async () => {
    const open = indexedDB.open("tap2chef");
    const idb = await new Promise((res, rej) => ((open.onsuccess = () => res(open.result)), (open.onerror = rej)));
    const tx = idb.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ key: "setup", value: JSON.stringify({ step: "done" }) });
    tx.objectStore("meta").put({ key: "safeCopyCardDismissed", value: "1" });
    await new Promise((res) => (tx.oncomplete = res));
    idb.close();
  });
  // Raw writes aren't seen by the open page: load it again.
  await page.goto(url);
}
