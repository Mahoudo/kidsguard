// Reads `eas build:list --json` from stdin, takes build IDs as argv.
// Prints "id status url" per build. Exit 0 if all finished/errored, else 1.
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const ids = process.argv.slice(2);
  let arr;
  try { arr = JSON.parse(s); } catch { console.log("parse-fail"); process.exit(2); }
  let allDone = true;
  const out = [];
  for (const id of ids) {
    const b = arr.find((x) => x.id === id);
    const st = b?.status ?? "unknown";
    const url = b?.artifacts?.applicationArchiveUrl ?? "";
    out.push(`${id.slice(0, 8)}  ${st}  ${url}`);
    if (st !== "finished" && st !== "errored" && st !== "canceled") allDone = false;
  }
  console.log(out.join("\n"));
  process.exit(allDone ? 0 : 1);
});
