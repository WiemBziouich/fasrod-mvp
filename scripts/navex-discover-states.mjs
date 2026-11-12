import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { API_ORIGIN, getStatesWithFetch } from "../lib/navex/client-core.mjs";

export async function runStateDiscovery({
  filePath,
  token,
  client,
  output = console.log,
  target = API_ORIGIN,
}) {
  if (!token) throw new Error("navex_not_configured");
  if (target !== "https://app.navex.tn") {
    throw new Error("navex_bad_response");
  }
  const contents = await readFile(filePath, "utf8");
  const codes = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (codes.length > 100) throw new Error("navex_bad_response");
  if (codes.some((code) => !/^\d{12}$/.test(code))) {
    throw new Error("navex_bad_response");
  }

  const results = await client.getStates(codes);
  const distinct = new Map();
  for (const result of results) {
    if (result.status !== 1) continue;
    const key = JSON.stringify([
      safeOutputValue(result.etat, token),
      safeOutputValue(result.motif ?? "", token),
      safeOutputValue(result.pre_etat ?? "", token),
    ]);
    distinct.set(key, (distinct.get(key) ?? 0) + 1);
  }
  const missing = results.filter((result) => result.status === 0).length;
  output(`Traités : ${codes.length}`);
  output(`Introuvables : ${missing}`);
  output("etat | motif | pre_etat | nombre");
  for (const [key, count] of distinct) {
    const [etat, motif, preEtat] = JSON.parse(key);
    output(`${etat} | ${motif} | ${preEtat} | ${count}`);
  }
  return { processed: codes.length, missing, distinct: distinct.size };
}

function safeOutputValue(value, token) {
  return String(value)
    .split(token)
    .join("[redacted]")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]")
    .replace(/[\r\n|]+/g, " ");
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("navex_bad_response");
    process.exitCode = 1;
  } else {
    runStateDiscovery({
      filePath,
      token: process.env.NAVEX_READ_TOKEN,
      client: {
        getStates(codes) {
          return getStatesWithFetch(codes, process.env.NAVEX_READ_TOKEN);
        },
      },
      target: process.env.NAVEX_API_ORIGIN ?? API_ORIGIN,
    }).catch((error) => {
      const code = error instanceof Error ? error.message : "navex_network";
      console.error(
        [
          "navex_not_configured",
          "navex_auth",
          "navex_bad_response",
          "navex_timeout",
          "navex_network",
        ].includes(code)
          ? code
          : "navex_network"
      );
      process.exitCode = 1;
    });
  }
}
