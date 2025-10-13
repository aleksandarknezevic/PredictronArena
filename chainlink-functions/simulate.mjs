import "dotenv/config";
import fs from "fs";
import { simulateScript, decodeResult, ReturnType } from "@chainlink/functions-toolkit";

for (const k of ["CMC_API_KEY", "CF_API_TOKEN", "CF_ACCOUNT_ID"]) {
  if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
}

const source = fs.readFileSync("./source.js", "utf8");

const sim = await simulateScript({
  source,
  args: ["HBAR", "USD"],
  secrets: {
    CMC_API_KEY: String(process.env.CMC_API_KEY),
    CF_API_TOKEN: String(process.env.CF_API_TOKEN),
    CF_ACCOUNT_ID: String(process.env.CF_ACCOUNT_ID),
  },
  maxOnChainResponseBytes: 1024,
});

console.log("response hex:", sim.responseBytesHexstring);
if (sim.capturedTerminalOutput) console.log(sim.capturedTerminalOutput.trim());
if (sim.errorString) {
  console.error("Simulation error:", sim.errorString);
  process.exit(1);
}

const decoded = decodeResult(sim.responseBytesHexstring, ReturnType.uint256);
console.log("Decoded result (uint):", decoded.toString());
