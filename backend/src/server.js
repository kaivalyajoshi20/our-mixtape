import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";
import crypto from "crypto";

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3000;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized:false } : false }) : null;
const ownerToken = process.env.EDIT_TOKEN || "";
const allowedOrigins = process.env.FRONTEND_ORIGIN?.split(",").map(s=>s.trim()).filter(Boolean) || [];
const rateWindowMs = 60_000;
const rateLimit = new Map();

function sameOrigin(origin) { return !origin || allowedOrigins.includes(origin); }
function rateLimited(ip) {
  const now = Date.now(), entry = rateLimit.get(ip);
  if (!entry || now - entry.start > rateWindowMs) { rateLimit.set(ip,{start:now,count:1}); return false; }
  entry.count += 1; return entry.count > 60;
}
function requireOwner(req,res,next) {
  if (!ownerToken) return res.status(503).json({error:"Editing is not configured"});
  const supplied = (req.get("authorization") || "").startsWith("Bearer ") ? req.get("authorization").slice(7) : "";
  const a=Buffer.from(supplied), b=Buffer.from(ownerToken);
  if (a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:"Unauthorized"});
  next();
}
function cleanText(value,max=2000) { return typeof value==="string" ? value.trim().slice(0,max) : ""; }
function cleanUrl(value) {
  const raw=cleanText(value,1000); if(!raw) return "";
  try {
    const u=new URL(raw), host=u.hostname.toLowerCase();
    if(u.protocol!=="https:") return "";
    if(host==="youtube.com" || host.endsWith(".youtube.com") || host==="youtu.be" || host==="spotify.com" || host.endsWith(".spotify.com")) return u.toString();
  } catch {}
  return "";
}
function cleanMemories(value) {
  if(!Array.isArray(value)) return [];
  return value.slice(0,50).map((m,i)=>({id:Number.isFinite(Number(m?.id))?Number(m.id):Date.now()+i,title:cleanText(m?.title,160),date:cleanText(m?.date,120),story:cleanText(m?.story,1000),image:cleanUrl(m?.image)})).filter(m=>m.title);
}

app.use(cors({
  origin(origin,callback){ return callback(null, sameOrigin(origin)); },
  methods:["GET","POST","OPTIONS"],
  allowedHeaders:["Content-Type","Authorization"],
  optionsSuccessStatus:204
}));
app.disable("x-powered-by");
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control","no-store");
  if(process.env.NODE_ENV==="production") res.setHeader("Strict-Transport-Security","max-age=31536000; includeSubDomains");
  next();
});
app.use((req,res,next)=>rateLimited(req.ip)?res.status(429).json({error:"Too many requests"}):next());
app.use(express.json({ limit:"256kb" }));

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

app.post("/api/mixes", requireOwner, async (req,res) => {
  if (!pool) return res.status(503).json({error:"Database is not configured yet"});
  const { slug, title, recipient="", message="", songs=[], memories=[] } = req.body || {};
  if (!slug || !title) return res.status(400).json({error:"slug and title are required"});
  const safeSlug=cleanText(slug,60).toLowerCase(), safeTitle=cleanText(title,200), safeRecipient=cleanText(recipient,120), safeMessage=cleanText(message,2000);
  if (!/^[a-z0-9-]{3,60}$/.test(safeSlug) || !safeTitle) return res.status(400).json({error:"invalid mixtape data"});
  const safeSongs=(Array.isArray(songs)?songs:[]).slice(0,100).map(song=>({title:cleanText(song?.title,200),artist:cleanText(song?.artist,160),note:cleanText(song?.note,500),url:cleanUrl(song?.url)})).filter(song=>song.title);
  const safeMemories=cleanMemories(memories);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const mix = await client.query(
      "INSERT INTO mixtapes(slug,title,recipient,message,memories) VALUES($1,$2,$3,$4,$5) ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,recipient=EXCLUDED.recipient,message=EXCLUDED.message,memories=EXCLUDED.memories,updated_at=NOW() RETURNING *",
      [safeSlug,safeTitle,safeRecipient,safeMessage,JSON.stringify(safeMemories)]
    );
    await client.query("DELETE FROM songs WHERE mixtape_id=$1",[mix.rows[0].id]);
    for (const [position,song] of safeSongs.entries()) {
      if (!song?.title) continue;
      await client.query(
        "INSERT INTO songs(mixtape_id,position,title,artist,note,url) VALUES($1,$2,$3,$4,$5,$6)",
        [mix.rows[0].id,position,song.title,song.artist,song.note,song.url]
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
