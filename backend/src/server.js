import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3000;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized:false } : false }) : null;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(",").map(s=>s.trim()).filter(Boolean) || "*" }));
app.use(express.json({ limit:"1mb" }));

const fallbackMix = {
  slug:"for-you",
  title:"A little mixtape for you.",
  recipient:"you",
  message:"Songs, memories, tiny messages and all the feelings I don't always know how to say out loud.",
  songs:[],
  memories:[]
};

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mixtapes (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      recipient TEXT DEFAULT '',
      message TEXT DEFAULT '',
      memories JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE mixtapes ADD COLUMN IF NOT EXISTS memories JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE TABLE IF NOT EXISTS songs (
      id BIGSERIAL PRIMARY KEY,
      mixtape_id BIGINT REFERENCES mixtapes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      artist TEXT DEFAULT '',
      note TEXT DEFAULT '',
      url TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function getMix(slug) {
  const { rows } = await pool.query("SELECT * FROM mixtapes WHERE slug=$1",[slug]);
  if (!rows[0]) return null;
  const songs = await pool.query("SELECT id,position,title,artist,note,url FROM songs WHERE mixtape_id=$1 ORDER BY position,id",[rows[0].id]);
  return { ...rows[0], memories: Array.isArray(rows[0].memories) ? rows[0].memories : [], songs:songs.rows };
}

app.get("/health", async (_req,res) => {
  if (!pool) return res.json({ ok:true, database:"not-configured" });
  try { await pool.query("SELECT 1"); res.json({ok:true,database:"connected"}); }
  catch { res.status(503).json({ok:false,database:"unavailable"}); }
});

app.get("/api/mixes/:slug", async (req,res) => {
  if (!pool) return res.json(fallbackMix);
  try {
    const mix = await getMix(req.params.slug);
    if (!mix) return res.status(404).json({error:"Mixtape not found"});
    res.json(mix);
  } catch (e) { res.status(500).json({error:"Could not load mixtape"}); }
});

app.post("/api/mixes", async (req,res) => {
  if (!pool) return res.status(503).json({error:"Database is not configured yet"});
  const { slug, title, recipient="", message="", songs=[], memories=[] } = req.body || {};
  if (!slug || !title) return res.status(400).json({error:"slug and title are required"});
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return res.status(400).json({error:"slug must use lowercase letters, numbers and hyphens"});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const mix = await client.query(
      "INSERT INTO mixtapes(slug,title,recipient,message,memories) VALUES($1,$2,$3,$4,$5) ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,recipient=EXCLUDED.recipient,message=EXCLUDED.message,memories=EXCLUDED.memories,updated_at=NOW() RETURNING *",
      [slug,title,recipient,message,JSON.stringify(Array.isArray(memories) ? memories : [])]
    );
    await client.query("DELETE FROM songs WHERE mixtape_id=$1",[mix.rows[0].id]);
    for (const [position,song] of songs.entries()) {
      if (!song?.title) continue;
      await client.query(
        "INSERT INTO songs(mixtape_id,position,title,artist,note,url) VALUES($1,$2,$3,$4,$5,$6)",
        [mix.rows[0].id,position,song.title,song.artist||"",song.note||"",song.url||""]
      );
    }
    await client.query("COMMIT");
    res.status(201).json(await getMix(slug));
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({error:"Could not save mixtape"});
  } finally { client.release(); }
});

app.use((_req,res)=>res.status(404).json({error:"Not found"}));

initDb().then(()=>app.listen(port,()=>console.log(`Our Mixtape API listening on ${port}`))).catch(err=>{console.error(err);process.exit(1)});
