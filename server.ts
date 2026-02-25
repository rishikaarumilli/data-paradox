import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("data_paradox.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    balance REAL DEFAULT 2000
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme TEXT,
    actual_value REAL,
    status TEXT DEFAULT 'open' -- 'open', 'closed', 'revealed'
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER,
    round_id INTEGER,
    predicted_value REAL,
    bid_amount REAL,
    score REAL DEFAULT 0,
    error_percent REAL,
    FOREIGN KEY(team_id) REFERENCES teams(id),
    FOREIGN KEY(round_id) REFERENCES rounds(id)
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('game_title', 'DATA PARADOX');
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    const correctPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (password === correctPassword) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Incorrect password" });
    }
  });

  // Admin Middleware
  const adminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const password = req.headers['x-admin-password'];
    const correctPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (password === correctPassword) {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  };

  // API Routes
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const result = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(result);
  });

  app.post("/api/admin/settings", adminAuth, (req, res) => {
    const { key, value } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
    broadcast({ type: "SETTINGS_UPDATED", key, value });
    res.json({ success: true });
  });

  app.get("/api/teams", (req, res) => {
    const teams = db.prepare("SELECT * FROM teams ORDER BY balance DESC").all();
    res.json(teams);
  });

  app.post("/api/teams/join", (req, res) => {
    const { name } = req.body;
    try {
      const info = db.prepare("INSERT INTO teams (name) VALUES (?)").run(name);
      res.json({ id: info.lastInsertRowid, name, balance: 2000 });
    } catch (e) {
      const team = db.prepare("SELECT * FROM teams WHERE name = ?").get(name);
      if (team) {
        res.json(team);
      } else {
        res.status(400).json({ error: "Failed to join" });
      }
    }
  });

  app.get("/api/rounds/current", (req, res) => {
    const round = db.prepare("SELECT * FROM rounds ORDER BY id DESC LIMIT 1").get();
    res.json(round || null);
  });

  app.post("/api/admin/rounds", adminAuth, (req, res) => {
    const { theme } = req.body;
    db.prepare("UPDATE rounds SET status = 'revealed' WHERE status != 'revealed'").run();
    const info = db.prepare("INSERT INTO rounds (theme) VALUES (?)").run(theme);
    broadcast({ type: "ROUND_STARTED", round: { id: info.lastInsertRowid, theme, status: 'open' } });
    res.json({ id: info.lastInsertRowid, theme });
  });

  app.post("/api/submissions", (req, res) => {
    const { teamId, roundId, predictedValue, bidAmount } = req.body;
    
    const team = db.prepare("SELECT balance FROM teams WHERE id = ?").get(teamId);
    if (!team || team.balance < bidAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const existing = db.prepare("SELECT id FROM submissions WHERE team_id = ? AND round_id = ?").get(teamId, roundId);
    if (existing) {
      return res.status(400).json({ error: "Already submitted for this round" });
    }

    db.prepare(`
      INSERT INTO submissions (team_id, round_id, predicted_value, bid_amount)
      VALUES (?, ?, ?, ?)
    `).run(teamId, roundId, predictedValue, bidAmount);

    broadcast({ type: "SUBMISSION_RECEIVED", teamId });
    res.json({ success: true });
  });

  app.post("/api/admin/rounds/reveal", adminAuth, (req, res) => {
    const { roundId, actualValue } = req.body;
    
    db.prepare("UPDATE rounds SET actual_value = ?, status = 'revealed' WHERE id = ?")
      .run(actualValue, roundId);

    const submissions = db.prepare("SELECT * FROM submissions WHERE round_id = ?").all(roundId);

    for (const sub of submissions) {
      const error = Math.abs(sub.predicted_value - actualValue);
      const errorPercent = actualValue === 0 ? (sub.predicted_value === 0 ? 0 : 100) : (error / actualValue) * 100;
      
      let multiplier = 1;
      if (errorPercent <= 2) multiplier = 3;
      else if (errorPercent <= 5) multiplier = 2;
      else if (errorPercent <= 10) multiplier = 1.5;

      const baseScore = sub.bid_amount * (1 / (1 + errorPercent));
      let finalScore = baseScore * multiplier;

      // Rule: If %Error > 25%, lose full bid
      if (errorPercent > 25) {
        finalScore = 0;
      }

      db.prepare("UPDATE submissions SET score = ?, error_percent = ? WHERE id = ?")
        .run(finalScore, errorPercent, sub.id);

      db.prepare("UPDATE teams SET balance = balance - ? + ? WHERE id = ?")
        .run(sub.bid_amount, finalScore, sub.team_id);
    }

    broadcast({ type: "ROUND_REVEALED", roundId, actualValue });
    res.json({ success: true });
  });

  app.get("/api/admin/submissions/:roundId", adminAuth, (req, res) => {
    const subs = db.prepare(`
      SELECT s.*, t.name as team_name 
      FROM submissions s 
      JOIN teams t ON s.team_id = t.id 
      WHERE s.round_id = ?
    `).all(req.params.roundId);
    res.json(subs);
  });

  app.post("/api/admin/reset", adminAuth, (req, res) => {
    console.log("Admin requested game reset");
    try {
      db.exec(`
        DELETE FROM submissions;
        DELETE FROM rounds;
        DELETE FROM teams;
        DELETE FROM sqlite_sequence WHERE name IN ('submissions', 'rounds', 'teams');
      `);

      console.log("Database cleared successfully");
      broadcast({ type: "GAME_RESET" });
      res.json({ success: true });
    } catch (error) {
      console.error("Reset error:", error);
      res.status(500).json({ error: "Database reset failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // WebSocket Setup
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  function broadcast(data: any) {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

startServer();
