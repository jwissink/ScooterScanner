// Minimale, dependency-vrije server voor ScooterScanner.
// - Serveert index.html (statisch).
// - POST /report: mailt het diagnoserapport via de lokale SMTP-relay
//   (127.0.0.1:25) naar REPORT_TO. Zo hoeft de gebruiker (vader) niets met een
//   mail-app te doen.
//
// Haven-conventie: host-networking, dus binden op HOST (127.0.0.1) en PORT uit
// de omgeving. NOOIT op 0.0.0.0.
const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || "4105", 10);
const ROOT = __dirname;

const SMTP_HOST = process.env.SMTP_HOST || "127.0.0.1";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "25", 10);
const MAIL_FROM = process.env.MAIL_FROM || "noreply@ludolabsdev.eu";
const REPORT_TO = process.env.REPORT_TO || "jwissink@gmail.com";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

// --- Kleine, sequentiële SMTP-client (localhost, geen auth/TLS nodig) ---------
function buildMessage({ from, to, subject, text }) {
  const headers = [
    `From: ScooterScanner <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    `Date: ${new Date().toUTCString()}`,
  ].join("\r\n");
  let body = String(text).replace(/\r?\n/g, "\r\n");
  // Dot-stuffing: een regel die met '.' begint moet verdubbeld worden.
  body = body
    .split("\r\n")
    .map((l) => (l.startsWith(".") ? "." + l : l))
    .join("\r\n");
  return headers + "\r\n\r\n" + body;
}

function smtpSend({ from, to, message }) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: SMTP_HOST, port: SMTP_PORT });
    sock.setEncoding("utf8");
    let buf = "";
    let waiter = null;
    const timer = setTimeout(() => {
      try { sock.destroy(); } catch (_) {}
      reject(new Error("SMTP timeout"));
    }, 15000);

    function pump() {
      if (!waiter) return;
      let idx;
      while ((idx = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (/^\d{3} /.test(line)) {
          const w = waiter;
          waiter = null;
          w({ code: parseInt(line.slice(0, 3), 10), line });
          return;
        }
        // continuation (NNN-...) -> lees verder
      }
    }
    function reply() {
      return new Promise((res) => { waiter = res; pump(); });
    }

    sock.on("data", (d) => { buf += d; pump(); });
    sock.on("error", (e) => { clearTimeout(timer); reject(e); });

    (async () => {
      let r = await reply(); if (r.code !== 220) throw new Error("greeting: " + r.line);
      sock.write("EHLO scooterscanner\r\n"); r = await reply(); if (r.code !== 250) throw new Error("EHLO: " + r.line);
      sock.write(`MAIL FROM:<${from}>\r\n`); r = await reply(); if (r.code !== 250) throw new Error("MAIL FROM: " + r.line);
      sock.write(`RCPT TO:<${to}>\r\n`); r = await reply(); if (r.code !== 250 && r.code !== 251) throw new Error("RCPT TO: " + r.line);
      sock.write("DATA\r\n"); r = await reply(); if (r.code !== 354) throw new Error("DATA: " + r.line);
      sock.write(message); sock.write("\r\n.\r\n"); r = await reply(); if (r.code !== 250) throw new Error("body: " + r.line);
      sock.write("QUIT\r\n");
      clearTimeout(timer); sock.end();
      resolve(r.line);
    })().catch((e) => { clearTimeout(timer); try { sock.destroy(); } catch (_) {} reject(e); });
  });
}

function handleReport(req, res) {
  let body = "";
  let tooBig = false;
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 512 * 1024) { tooBig = true; req.destroy(); }
  });
  req.on("end", async () => {
    if (tooBig) { res.writeHead(413, { "Content-Type": TYPES[".json"] }); return res.end('{"ok":false,"error":"rapport te groot"}'); }
    let data;
    try { data = JSON.parse(body || "{}"); } catch (_) {
      res.writeHead(400, { "Content-Type": TYPES[".json"] });
      return res.end('{"ok":false,"error":"ongeldige body"}');
    }
    const report = String(data.report || "").slice(0, 200000);
    if (!report.trim()) {
      res.writeHead(400, { "Content-Type": TYPES[".json"] });
      return res.end('{"ok":false,"error":"leeg rapport"}');
    }
    const dev = String(data.device || "onbekend apparaat").replace(/[\r\n]/g, " ").slice(0, 80);
    const subject = `ScooterScanner rapport - ${dev} - ${new Date().toISOString().slice(0, 10)}`;
    try {
      await smtpSend({ from: MAIL_FROM, to: REPORT_TO, message: buildMessage({ from: MAIL_FROM, to: REPORT_TO, subject, text: report }) });
      res.writeHead(200, { "Content-Type": TYPES[".json"] });
      res.end('{"ok":true}');
    } catch (e) {
      console.error("mail mislukt:", e.message);
      res.writeHead(502, { "Content-Type": TYPES[".json"] });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/report") return handleReport(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end("Method not allowed"); }
  try {
    let url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url === "/" || url === "") url = "/index.html";
    const filePath = path.normalize(path.join(ROOT, url));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
    fs.readFile(filePath, (err, dataBuf) => {
      if (err) {
        return fs.readFile(path.join(ROOT, "index.html"), (e2, d2) => {
          if (e2) { res.writeHead(404); return res.end("Not found"); }
          res.writeHead(200, { "Content-Type": TYPES[".html"] });
          res.end(d2);
        });
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream" });
      res.end(dataBuf);
    });
  } catch (e) {
    res.writeHead(500);
    res.end("Server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ScooterScanner serveert op http://${HOST}:${PORT} (mail -> ${REPORT_TO} via ${SMTP_HOST}:${SMTP_PORT})`);
});
