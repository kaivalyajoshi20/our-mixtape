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
app.set("trust proxy", 1);

function sameOrigin(origin) { return !origin || allowedOrigins.includes(origin); }
function clientIp(req) { return req.ip || "unknown"; }
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
function cleanImageUrl(value) {
  const raw=cleanText(value,2000); if(!raw) return "";
  try {
    const u=new URL(raw);
    if(u.protocol!=="https:" || u.username || u.password) return "";
    return u.toString();
  } catch { return ""; }
}
function cleanMemories(value) {
  if(!Array.isArray(value)) return [];
  return value.slice(0,50).map((m,i)=>({id:Number.isFinite(Number(m?.id))?Number(m.id):Date.now()+i,title:cleanText(m?.title,160),date:cleanText(m?.date,120),story:cleanText(m?.story,1000),image:cleanImageUrl(m?.image)})).filter(m=>m.title);
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
app.use((req,res,next)=>{
  if (req.path === "/health") return next();
  return rateLimited(clientIp(req)) ? res.status(429).json({error:"Too many requests"}) : next();
});
app.use(express.json({ limit:"256kb" }));

const fallbackMix = {
  slug:"for-you",
  title:"A little mixtape for you.",
  recipient:"you",
  message:"Songs, memories, tiny messages and all the feelings I don't always know how to say out loud.",
  songs:[],
  memories:[],
  relationship_date:null,
  version:1
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
      relationship_date DATE,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE mixtapes ADD COLUMN IF NOT EXISTS memories JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE mixtapes ADD COLUMN IF NOT EXISTS relationship_date DATE;
    ALTER TABLE mixtapes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
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
    CREATE INDEX IF NOT EXISTS songs_mixtape_position_idx ON songs (mixtape_id, position);
  `);
}

async function getMix(slug) {
  const { rows } = await pool.query("SELECT * FROM mixtapes WHERE slug=$1",[slug]);
  if (!rows[0]) return null;
  const songs = await pool.query("SELECT id,position,title,artist,note,url FROM songs WHERE mixtape_id=$1 ORDER BY position,id",[rows[0].id]);
  return { ...rows[0], memories: Array.isArray(rows[0].memories) ? rows[0].memories : [], songs:songs.rows };
}

app.get("/health", async (_req,res) => {
  if (!pool) {
    if (process.env.NODE_ENV === "production") return res.status(503).json({ok:false,database:"not-configured"});
    return res.json({ ok:true, database:"not-configured" });
  }
  try { await pool.query("SELECT 1"); res.json({ok:true,database:"connected"}); }
  catch { res.status(503).json({ok:false,database:"unavailable"}); }
});

app.get("/api/mixes/:slug", async (req,res) => {
  const safeSlug=cleanText(req.params.slug,60).toLowerCase();
  if (!/^[a-z0-9-]{3,60}$/.test(safeSlug)) return res.status(400).json({error:"Invalid mixtape slug"});
  if (!pool) return res.json(fallbackMix);
  try {
    const mix = await getMix(safeSlug);
    if (!mix) return res.status(404).json({error:"Mixtape not found"});
    res.json(mix);
  } catch { res.status(500).json({error:"Could not load mixtape"}); }
});

app.post("/api/mixes", requireOwner, async (req,res) => {
  if (!pool) return res.status(503).json({error:"Database is not configured yet"});
  const { slug, title, recipient="", message="", songs=[], memories=[], relationshipDate=null, version=null } = req.body || {};
  if (!slug || !title) return res.status(400).json({error:"slug and title are required"});
  const safeSlug=cleanText(slug,60).toLowerCase(), safeTitle=cleanText(title,200), safeRecipient=cleanText(recipient,120), safeMessage=cleanText(message,2000);
  if (!/^[a-z0-9-]{3,60}$/.test(safeSlug) || !safeTitle) return res.status(400).json({error:"invalid mixtape data"});
  const safeSongs=(Array.isArray(songs)?songs:[]).slice(0,100).map(song=>({title:cleanText(song?.title,200),artist:cleanText(song?.artist,160),note:cleanText(song?.note,500),url:cleanUrl(song?.url)})).filter(song=>song.title);
  const safeMemories=cleanMemories(memories);
  const safeDate = relationshipDate && /^\d{4}-\d{2}-\d{2}$/.test(relationshipDate) ? relationshipDate : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id,version FROM mixtapes WHERE slug=$1 FOR UPDATE",[safeSlug]);
    if (existing.rows[0]) {
      const currentVersion = Number(existing.rows[0].version || 1);
      if (version !== null && Number(version) !== currentVersion) {
        await client.query("ROLLBACK");
        return res.status(409).json({error:"Mixtape changed elsewhere. Reload before saving.",version:currentVersion});
      }
    }
    const mix = await client.query(
      "INSERT INTO mixtapes(slug,title,recipient,message,memories,relationship_date,version) VALUES($1,$2,$3,$4,$5,$6,1) ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,recipient=EXCLUDED.recipient,message=EXCLUDED.message,memories=EXCLUDED.memories,relationship_date=EXCLUDED.relationship_date,version=mixtapes.version+1,updated_at=NOW() RETURNING *",
      [safeSlug,safeTitle,safeRecipient,safeMessage,JSON.stringify(safeMemories),safeDate]
    );
    await client.query("DELETE FROM songs WHERE mixtape_id=$1",[mix.rows[0].id]);
    for (const [position,song] of safeSongs.entries()) {
      await client.query(
        "INSERT INTO songs(mixtape_id,position,title,artist,note,url) VALUES($1,$2,$3,$4,$5,$6)",
        [mix.rows[0].id,position,song.title,song.artist,song.note,song.url]
      );
    }
    await client.query("COMMIT");
    res.status(201).json(await getMix(safeSlug));
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({error:"Could not save mixtape"});
  } finally { client.release(); }
});

app.use((_req,res)=>res.status(404).json({error:"Not found"}));

initDb().then(()=>app.listen(port,()=>console.log(`Our Mixtape API listening on ${port}`))).catch(err=>{console.error(err);process.exit(1)});
