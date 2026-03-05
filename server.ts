import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import pkg from "pg";
const { Pool } = pkg;
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {

  await db.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE,
      balance FLOAT DEFAULT 2000
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS rounds (
      id SERIAL PRIMARY KEY,
      theme TEXT,
      actual_value FLOAT,
      status TEXT DEFAULT 'open'
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      team_id INTEGER REFERENCES teams(id),
      round_id INTEGER REFERENCES rounds(id),
      predicted_value FLOAT,
      bid_amount FLOAT,
      score FLOAT DEFAULT 0,
      error_percent FLOAT
    );
  `);

  await db.query(`
    INSERT INTO settings (key,value)
    VALUES ('game_title','DATA PARADOX')
    ON CONFLICT (key) DO NOTHING
  `);

}

async function startServer() {

  await initDB();

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  app.post("/api/admin/login",(req,res)=>{
    const {password} = req.body
    const correct = process.env.ADMIN_PASSWORD || "admin123"

    if(password===correct){
      res.json({success:true})
    }else{
      res.status(401).json({error:"Incorrect password"})
    }
  })

  const adminAuth = (req,res,next)=>{
    const password = req.headers["x-admin-password"]
    const correct = process.env.ADMIN_PASSWORD || "admin123"

    if(password===correct){
      next()
    }else{
      res.status(401).json({error:"Unauthorized"})
    }
  }

  app.get("/api/settings",async(req,res)=>{
    const result = await db.query("SELECT * FROM settings")
    const data={}
    result.rows.forEach(r=>{
      data[r.key]=r.value
    })
    res.json(data)
  })

  app.post("/api/admin/settings",adminAuth,async(req,res)=>{
    const {key,value}=req.body
    await db.query(
      "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2",
      [key,value]
    )
    broadcast({type:"SETTINGS_UPDATED"})
    res.json({success:true})
  })

  app.get("/api/teams",async(req,res)=>{
    const result = await db.query("SELECT * FROM teams ORDER BY balance DESC")
    res.json(result.rows)
  })

  app.post("/api/teams/join",async(req,res)=>{
    const {name}=req.body

    try{

      const result = await db.query(
        "INSERT INTO teams(name) VALUES($1) RETURNING *",
        [name]
      )

      res.json(result.rows[0])

    }catch{

      const existing = await db.query(
        "SELECT * FROM teams WHERE name=$1",
        [name]
      )

      if(existing.rows.length>0){
        res.json(existing.rows[0])
      }else{
        res.status(400).json({error:"Failed"})
      }
    }
  })

  app.get("/api/rounds/current",async(req,res)=>{
    const result = await db.query(
      "SELECT * FROM rounds ORDER BY id DESC LIMIT 1"
    )

    res.json(result.rows[0] || null)
  })

  app.post("/api/admin/rounds",adminAuth,async(req,res)=>{

    const {theme}=req.body

    await db.query("UPDATE rounds SET status='revealed' WHERE status!='revealed'")

    const result = await db.query(
      "INSERT INTO rounds(theme) VALUES($1) RETURNING *",
      [theme]
    )

    broadcast({type:"ROUND_STARTED",round:result.rows[0]})

    res.json(result.rows[0])

  })

  app.post("/api/submissions",async(req,res)=>{

    const {teamId,roundId,predictedValue,bidAmount}=req.body

    const team = await db.query(
      "SELECT balance FROM teams WHERE id=$1",
      [teamId]
    )

    if(team.rows.length===0 || team.rows[0].balance < bidAmount){
      return res.status(400).json({error:"Insufficient balance"})
    }

    const existing = await db.query(
      "SELECT id FROM submissions WHERE team_id=$1 AND round_id=$2",
      [teamId,roundId]
    )

    if(existing.rows.length>0){
      return res.status(400).json({error:"Already submitted"})
    }

    await db.query(
      `INSERT INTO submissions
      (team_id,round_id,predicted_value,bid_amount)
      VALUES($1,$2,$3,$4)`,
      [teamId,roundId,predictedValue,bidAmount]
    )

    broadcast({type:"SUBMISSION_RECEIVED",teamId})

    res.json({success:true})

  })

  app.post("/api/admin/rounds/reveal",adminAuth,async(req,res)=>{

    const {roundId,actualValue}=req.body

    await db.query(
      "UPDATE rounds SET actual_value=$1,status='revealed' WHERE id=$2",
      [actualValue,roundId]
    )

    const subs = await db.query(
      "SELECT * FROM submissions WHERE round_id=$1",
      [roundId]
    )

    for(const sub of subs.rows){

      const error = Math.abs(sub.predicted_value-actualValue)

      const errorPercent = actualValue===0
        ? (sub.predicted_value===0?0:100)
        : (error/actualValue)*100

      let multiplier=0

      if(errorPercent<=5) multiplier=3
      else if(errorPercent<=10) multiplier=2
      else if(errorPercent<=20) multiplier=1.5
      else if(errorPercent<=25) multiplier=1
      else multiplier=-1

      let finalScore=0

      if(multiplier!==-1){
        finalScore=sub.bid_amount*multiplier
      }

      await db.query(
        "UPDATE submissions SET score=$1,error_percent=$2 WHERE id=$3",
        [finalScore,errorPercent,sub.id]
      )

      await db.query(
        "UPDATE teams SET balance = balance - $1 + $2 WHERE id=$3",
        [sub.bid_amount,finalScore,sub.team_id]
      )
    }

    broadcast({type:"ROUND_REVEALED",roundId,actualValue})

    res.json({success:true})

  })

  app.get("/api/admin/submissions/:roundId",adminAuth,async(req,res)=>{

    const result = await db.query(
      `SELECT s.*,t.name as team_name
       FROM submissions s
       JOIN teams t ON s.team_id=t.id
       WHERE s.round_id=$1`,
      [req.params.roundId]
    )

    res.json(result.rows)

  })

  app.post("/api/admin/reset",adminAuth,async(req,res)=>{

    await db.query("DELETE FROM submissions")
    await db.query("DELETE FROM rounds")
    await db.query("DELETE FROM teams")

    broadcast({type:"GAME_RESET"})

    res.json({success:true})

  })

  if(process.env.NODE_ENV!=="production"){

    const vite = await createViteServer({
      server:{middlewareMode:true},
      appType:"spa"
    })

    app.use(vite.middlewares)

  }else{

    app.use(express.static(path.join(__dirname,"dist")))

  }

  const server = app.listen(PORT,()=>{
    console.log("Server running")
  })

  const wss = new WebSocketServer({server})

  const clients=new Set()

  wss.on("connection",ws=>{
    clients.add(ws)
    ws.on("close",()=>clients.delete(ws))
  })

  function broadcast(data){

    const msg = JSON.stringify(data)

    clients.forEach(c=>{
      if(c.readyState===WebSocket.OPEN){
        c.send(msg)
      }
    })

  }

}

startServer()