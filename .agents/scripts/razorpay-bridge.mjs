import readline from "node:readline";

const KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
if (!KEY_ID || !KEY_SECRET) {
  process.stderr.write("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in environment.\n");
}
const token = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
const MCP_ENDPOINT = "https://mcp.razorpay.com/mcp";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const jsonReq = JSON.parse(trimmed);
    const res = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jsonReq),
    });

    const jsonRes = await res.json();
    process.stdout.write(JSON.stringify(jsonRes) + "\n");
  } catch (err) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.id !== undefined) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: parsed.id,
            error: { code: -32603, message: String(err) },
          }) + "\n"
        );
      }
    } catch {
      // ignore parsing error
    }
  }
});
