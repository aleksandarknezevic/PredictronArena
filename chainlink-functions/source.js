// source.js — Chainlink Functions (Deno, fetch-only)

// Secrets:
//  - secrets.CMC_API_KEY
//  - secrets.CF_API_TOKEN
//  - secrets.CF_ACCOUNT_ID
// Args:
//  - args[0] symbol (default HBAR)
//  - args[1] convert (default USD)

const SYMBOL  = (args[0] || "HBAR").toUpperCase();
const CONVERT = (args[1] || "USD").toUpperCase();


const TOTAL_BUDGET_MS = 9000;
const T0 = Date.now();
const timeLeft = () => Math.max(0, TOTAL_BUDGET_MS - (Date.now() - T0));

const CMC_TIMEOUT_MS = 3000;
const CF_TIMEOUT_MS  = 3500;
const RETRIES        = 0;
const RETRY_DELAY_MS = 0;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(n)) ? Number(n) : lo));
const normDir = (x="") => /up|bull|rise|green|positive/i.test(x) ? "up"
                        : /down|bear|fall|red|negative/i.test(x) ? "down" : "flat";
const stripFences = (s="") => s.replace(/```json|```/gi,"");
function extractFirstJson(s=""){ s=stripFences(s).trim(); const i=s.indexOf("{"); if(i<0)return null;
  let d=0; for(let j=i;j<s.length;j++){ const c=s[j]; if(c==="{") d++; else if(c==="}"){ d--; if(d===0){
    const chunk=s.slice(i,j+1); try{ return JSON.parse(chunk);}catch{} } } } return null; }

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
async function fetchJSONWithTimeout(url, options={}, timeoutMs=2000){
  const ctrl = new AbortController(); const t=setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(url,{...options, signal: ctrl.signal});
    const txt = await res.text();
    let json=null; try{ json = txt ? JSON.parse(txt) : null; }catch{}
    return {res, json, txt};
  } finally { clearTimeout(t); }
}
async function fetchJSONRetry(url, options, timeoutMs, retries=0, delayMs=0){
  for(let k=0;;k++){
    try{
      const {res,json,txt}=await fetchJSONWithTimeout(url,options,timeoutMs);
      if(res.status===429 || (res.status>=500 && res.status<=599)){
        if(k<retries){ if(delayMs) await sleep(delayMs); continue; }
      }
      return {res,json,txt};
    }catch(e){
      if(k<retries){ if(delayMs) await sleep(delayMs); continue; }
      throw e;
    }
  }
}

async function getCMCQuote(sym, conv){
  const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${sym}&convert=${conv}`;
  const headers = { "X-CMC_PRO_API_KEY": secrets.CMC_API_KEY };
  const {res,json,txt} = await fetchJSONRetry(url,{headers}, Math.min(CMC_TIMEOUT_MS, timeLeft()), RETRIES, RETRY_DELAY_MS);
  if(!res.ok) throw new Error(`CMC ${res.status}: ${txt?.slice(0,120)}`);
  const q = json?.data?.[sym]?.quote?.[conv];
  if(!q) throw new Error("CMC: missing quote");
  return { price: q.price, pct1h: q.percent_change_1h, ts: q.last_updated };
}

async function callWorkersAI(accountId, token, prompt){
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`;
  const body = JSON.stringify({ messages:[{role:"user", content: prompt}], temperature:0 });
  const {res,json,txt} = await fetchJSONRetry(
    url,
    { method:"POST", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json"}, body },
    Math.min(CF_TIMEOUT_MS, timeLeft()),
    RETRIES,
    RETRY_DELAY_MS
  );
  if(!res.ok) throw new Error(`CF ${res.status}: ${txt?.slice(0,120)}`);
  return json?.result?.response ?? json?.result?.output_text ?? "";
}

let quote = { price:null, pct1h:null, ts:new Date().toISOString() };

try { if(timeLeft() > 500) quote = await getCMCQuote(SYMBOL, CONVERT); } catch(e){ /* swallow */ }

const toSafeStr = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "null";
};
const safePrice = toSafeStr(quote.price);
const safePct1h = toSafeStr(quote.pct1h);

const prompt = [
  'Return ONLY minified JSON on a single line with this exact schema: {"direction":"up|down"}.',
  `Task: Predict the next 60 minutes direction for ${SYMBOL}/${CONVERT}.`,
  `Inputs: price=${safePrice}, pct_1h=${safePct1h}.`,
  'Rules: choose exactly "up" or "down" (no "flat", no other words or fields).',
  'If inputs are missing/uncertain, output {"direction":"down"}.',
  'No prose, no code fences, no extra keys—JSON only.'
].join(' ');

let dir = "down";
if (timeLeft() > 1200 && secrets.CF_ACCOUNT_ID && secrets.CF_API_TOKEN) {
  try {
    const aiRaw = await callWorkersAI(secrets.CF_ACCOUNT_ID, secrets.CF_API_TOKEN, prompt);
    const parsed = extractFirstJson(aiRaw) ?? {};
    const d = normDir(parsed.direction);
    dir = (d === "up") ? "up" : "down";
  } catch {}
}

const code = (dir === "up") ? 1 : 2;
return Functions.encodeUint256(code);
