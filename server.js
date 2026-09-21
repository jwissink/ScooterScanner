// Minimale, dependency-vrije statische server voor ScooterScanner.
// Haven-conventie: host-networking, dus binden op HOST (altijd 127.0.0.1) en
// PORT uit de omgeving. NOOIT op 0.0.0.0 binden -- dat zou de app buiten Caddy
// om publiek openzetten.
const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = parseInt(process.env.PORT || "4105", 10);
const ROOT = __dirname;

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

const server = http.createServer((req, res) => {
  try {
    let url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url === "/" || url === "") url = "/index.html";
    const filePath = path.normalize(path.join(ROOT, url));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        // Terugval op index.html (single-page).
        return fs.readFile(path.join(ROOT, "index.html"), (e2, d2) => {
          if (e2) {
            res.writeHead(404);
            return res.end("Not found");
          }
          res.writeHead(200, { "Content-Type": TYPES[".html"] });
          res.end(d2);
        });
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream" });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500);
    res.end("Server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ScooterScanner serveert op http://${HOST}:${PORT}`);
});
