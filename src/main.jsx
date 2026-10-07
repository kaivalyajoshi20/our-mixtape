import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Heart, Music2, Plus, GripVertical, Play, Pause, Sparkles, X, Link2, Headphones, Pencil } from "lucide-react";
import "./styles.css";

const starterSongs = [
  { id: 1, title: "Our first song", artist: "add an artist", note: "The one that makes me think of you.", cover: "♪", url: "" },
  { id: 2, title: "That one we played on repeat", artist: "your favorite artist", note: "Some songs just become memories.", cover: "♫", url: "" },
  { id: 3, title: "For the late nights", artist: "your soundtrack", note: "For every little moment after midnight.", cover: "♬", url: "" }
];

const starterMemories = [
  { id: 1, title: "The beginning", date: "the day it all started", story: "A tiny moment that became a very big part of my life.", image: "" },
  { id: 2, title: "That one perfect day", date: "a favorite memory", story: "The kind of day I wish I could replay whenever I miss you.", image: "" },
  { id: 3, title: "Still my favorite", date: "one of many", story: "There are a thousand little reasons I would choose you again.", image: "" }
];

const missYouMessages = [
  "If you miss me, press play. I am probably missing you too. ♡",
  "Come here. Consider this a tiny digital hug.",
  "Somewhere out there, I am thinking about you right now.",
  "You are my favorite notification.",
  "Okay, enough missing me. Come give me a hug. ♥",
  "I would choose you in every version of this story."
];

function getYouTubeVideoId(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] || "";
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const queryId = u.searchParams.get("v");
      if (queryId) return queryId;
      const parts = u.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0])) return parts[1] || "";
    }
  } catch {}
  return "";
}

function getYouTubeWatchUrl(url) {
  const id = getYouTubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : "";
}

function getSpotifyEmbedUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname.includes("spotify.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && ["track","album","playlist"].includes(parts[0])) {
        return `https://open.spotify.com/embed/${parts[0]}/${parts[1]}?utm_source=generator`;
      }
    }
  } catch {}
  return "";
}

function slugFromPath() {
  const match = window.location.pathname.match(/^\/mix\/([a-z0-9-]{3,60})\/?$/i);
  return match ? match[1].toLowerCase() : "for-you";
}

function App() {
  const initialSlug = slugFromPath();
  const [songs, setSongs] = useState(starterSongs);
  const [memories, setMemories] = useState(starterMemories);
  const [playing, setPlaying] = useState(null);
  const [missYouMessage, setMissYouMessage] = useState("");
  const [ourDate, setOurDate] = useState(() => localStorage.getItem(`our-mixtape-date-${initialSlug}`) || "");
  const [showMemory, setShowMemory] = useState(false);
  const [newMemory, setNewMemory] = useState({ title: "", date: "", story: "", image: "" });
  const [floatingPlayer, setFloatingPlayer] = useState(null);
  const [tapeCorner, setTapeCorner] = useState("top-right");
  const [showAdd, setShowAdd] = useState(false);
  const [editingSong, setEditingSong] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dragged, setDragged] = useState(null);
  const [newSong, setNewSong] = useState({ title: "", artist: "", note: "", url: "" });
  const [slug, setSlug] = useState(initialSlug);
  const [saveState, setSaveState] = useState("");
  const [loadState, setLoadState] = useState("loading");
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [mixVersion, setMixVersion] = useState(1);
  const [ownerToken, setOwnerToken] = useState(() => sessionStorage.getItem("our-mixtape-owner-token") || "");
  const [showOwnerLogin, setShowOwnerLogin] = useState(false);
  const apiBase = import.meta.env.VITE_API_URL || "";
  const shareUrl = useMemo(() => window.location.href, [slug]);
  const isSharedMix = window.location.pathname.startsWith("/mix/");

  useEffect(() => {
    const onPopState = () => window.location.reload();
    window.addEventListener("popstate", onPopState);
    let cancelled = false;
    if (!apiBase) {
      setLoadState("ready");
      return;
    }
    setLoadState("loading");
    fetch(`${apiBase}/api/mixes/${encodeURIComponent(initialSlug)}`)
      .then(async res => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error("load failed");
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        if (data) {
          const loadedSlug = data.slug || initialSlug;
          const loadedDate = data.relationship_date ? String(data.relationship_date).slice(0,10) : "";
          setNotFound(false);
          setLoadError(false);
          setSlug(loadedSlug);
          setMixVersion(Number(data.version || 1));
          setOurDate(loadedDate);
          if (loadedDate) localStorage.setItem(`our-mixtape-date-${loadedSlug}`, loadedDate);
          else localStorage.removeItem(`our-mixtape-date-${loadedSlug}`);
          if (Array.isArray(data.songs)) setSongs(data.songs.length ? data.songs : []);
          if (Array.isArray(data.memories)) setMemories(data.memories.length ? data.memories : []);
        } else if (isSharedMix) {
          setNotFound(true);
        }
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("offline");
          if (isSharedMix) setLoadError(true);
        }
      });
    return () => { cancelled = true; window.removeEventListener("popstate", onPopState); };
  }, [apiBase, initialSlug]);

  function openEdit(song) {
    setEditingSong({...song});
  }

  function toggleSong(song) {
    const youtubeId = getYouTubeVideoId(song.url);
    const spotifyEmbed = getSpotifyEmbedUrl(song.url);
    if (!youtubeId && !spotifyEmbed) {
      setPlaying(playing === song.id ? null : song.id);
      setFloatingPlayer(null);
      return;
    }
    if (playing === song.id) {
      setPlaying(null);
      setFloatingPlayer(null);
      return;
    }
    setPlaying(song.id);
    if (youtubeId) {
      const corners = ["top-right", "top-left", "bottom-right", "bottom-left"];
      setTapeCorner(corners[Math.floor(Math.random() * corners.length)]);
      setFloatingPlayer({ songId: song.id, videoId: youtubeId });
    } else {
      setFloatingPlayer(null);
    }
  }

  function saveEditedSong(e) {
    e.preventDefault();
    if (!editingSong?.title?.trim()) return;
    setSongs(current => current.map(song => song.id === editingSong.id ? {
      ...song,
      title: editingSong.title.trim(),
      artist: editingSong.artist.trim() || "unknown artist",
      note: editingSong.note.trim() || "A song I wanted you to have.",
      url: editingSong.url.trim()
    } : song));
    setEditingSong(null);
  }

  function addMemory(e) {
    e.preventDefault();
    if (!newMemory.title.trim()) return;
    setMemories(current => [...current, {
      id: Date.now(),
      title: newMemory.title.trim(),
      date: newMemory.date.trim() || "a little memory",
      story: newMemory.story.trim() || "One of those moments I want to keep forever.",
      image: newMemory.image.trim()
    }]);
    setNewMemory({ title: "", date: "", story: "", image: "" });
    setShowMemory(false);
  }

  function addSong(e) {
    e.preventDefault();
    if (!newSong.title.trim()) return;
    setSongs(current => [...current, {
      id: Date.now(),
      title: newSong.title.trim(),
      artist: newSong.artist.trim() || "unknown artist",
      note: newSong.note.trim() || "A song I wanted you to have.",
      cover: "♪",
      url: newSong.url.trim()
    }]);
    setNewSong({ title: "", artist: "", note: "", url: "" });
    setShowAdd(false);
  }

  function dropSong(targetId) {
    if (!dragged || dragged === targetId) return;
    setSongs(current => {
      const next = [...current];
      const from = next.findIndex(s => s.id === dragged);
      const to = next.findIndex(s => s.id === targetId);
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDragged(null);
  }

  async function saveMixtape() {
    if (!ownerToken) {
      setShowOwnerLogin(true);
      return;
    }
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (cleanSlug.length < 3) {
      setSaveState("error");
      return;
    }
    setSlug(cleanSlug);
    setSaveState("saving");
    let conflict = false;
    try {
      const res = await fetch(apiBase + "/api/mixes", {
        method: "POST",
        headers: {"Content-Type":"application/json", "Authorization": "Bearer " + ownerToken},
        body: JSON.stringify({
          slug: cleanSlug,
          title: "A little mixtape for you.",
          recipient: "you",
          message: "Songs, memories, tiny messages and all the feelings I do not always know how to say out loud.",
          songs,
          memories,
          relationshipDate: ourDate || null,
          version: mixVersion
        })
      });
      if (res.status === 401) {
        sessionStorage.removeItem("our-mixtape-owner-token");
        setOwnerToken("");
        setShowOwnerLogin(true);
        throw new Error("unauthorized");
      }
      if (res.status === 409) {
        conflict = true;
        throw new Error("conflict");
      }
      if (!res.ok) throw new Error("save failed");
      const saved = await res.json();
      setMixVersion(Number(saved.version || mixVersion + 1));
      window.history.pushState({}, "", `/mix/${cleanSlug}`);
      setSaveState("saved");
      setTimeout(() => setSaveState(""), 2200);
    } catch {
      setSaveState(conflict ? "conflict" : "error");
    }
  }

  function saveOurDate(value) {
    setOurDate(value);
    const dateKey = `our-mixtape-date-${slug}`;
    if (value) localStorage.setItem(dateKey, value);
    else localStorage.removeItem(dateKey);
  }

  if (loadError) return (
    <main className="not-found-page"><section className="not-found-card"><p className="eyebrow"><Heart size={13} fill="currentColor"/> mixtape unavailable</p><h1>We lost the<br/><i>connection.</i></h1><p>This shared mixtape could not be loaded right now. Nothing was replaced with demo content.</p><button className="primary-btn" onClick={() => window.location.reload()}>Try again</button></section></main>
  );

  if (notFound) return (
    <main className="not-found-page"><section className="not-found-card"><p className="eyebrow"><Heart size={13} fill="currentColor"/> mixtape missing</p><h1>That little mixtape<br/><i>doesn’t exist.</i></h1><p>The link may be wrong, or this mixtape has not been saved yet.</p><a className="primary-btn" href="/">Back to our mixtape</a></section></main>
  );

  function daysTogether() {
    if (!ourDate) return null;
    const start = new Date(ourDate + "T00:00:00");
    if (Number.isNaN(start.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
  }

  function surpriseMe() {
    setMissYouMessage(missYouMessages[Math.floor(Math.random() * missYouMessages.length)]);
  }

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Our Mixtape ♥", text: "I made this little mixtape for you.", url: shareUrl });
      else {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  }

  return (
    <main>
      <nav className="nav">
        <div className="logo"><span>Mixtape</span><em>for us</em></div>
        <div className="nav-actions"><button className="save-btn" onClick={saveMixtape}><Heart size={14} fill={saveState==="saved" ? "currentColor" : "none"}/>{saveState==="saving" ? "Saving..." : saveState==="saved" ? "Saved!" : saveState==="conflict" ? "Reload needed" : saveState==="error" ? "Try again" : "Save"}</button><button className="share-btn" onClick={share}><Link2 size={15}/>{copied ? "Copied!" : "Share"}</button></div>
      </nav>

      <section className="hero section">
        <div className="hero-copy">
          <p className="eyebrow"><Heart size={13} fill="currentColor"/> made with stupid amounts of love</p>
          <h1>A little<br/><i>mixtape</i> for you.</h1>
          <p className="hero-note">Songs, memories, tiny messages and all the feelings I don't always know how to say out loud.</p>
          <div className="hero-actions">
            <a href="#songs" className="primary-btn">Open our mixtape <span>↓</span></a>
            <button className="ghost-btn" onClick={() => setShowAdd(true)}><Plus size={17}/> Add a song</button>
          </div>
        </div>
        <div className="cassette-wrap">
          <div className="tape-shadow"/>
          <div className="cassette">
            <div className="tape-top">OUR <span>LOVE</span> MIX</div>
            <div className="tape-window"><div className="reel left"/><div className="reel right"/></div>
            <div className="tape-label">side A<br/><strong>forever & ever</strong></div>
            <div className="tape-line"/>
            <div className="tape-small">♥ PLAY LOUD</div>
          </div>
          <div className="scribble">press play<br/>when you miss me ♡</div>
        </div>
      </section>

      <section id="songs" className="songs section">
        <div className="section-head">
          <div><p className="eyebrow">side A · our soundtrack</p><h2>The songs that<br/><i>feel like us.</i></h2></div>
          <span className="count">{String(songs.length).padStart(2,"0")} tracks</span>
        </div>
        <div className="mix-controls"><label>your link <span>/mix/</span><input value={slug} onChange={e=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-"))}/></label></div>
        <p className="section-hint"><GripVertical size={14}/> drag songs to change the order · {loadState==="loading" ? "loading your mixtape..." : loadState==="offline" ? "API not connected yet" : "save to keep this link forever"}</p>
        <div className="song-list">
          {songs.map((song, index) => {
            const youtubeId = getYouTubeVideoId(song.url);
            const spotifyEmbed = getSpotifyEmbedUrl(song.url);
            return <article className={`song-card ${playing === song.id ? "is-playing" : ""}`} key={song.id} draggable onDragStart={() => setDragged(song.id)} onDragOver={e => e.preventDefault()} onDrop={() => dropSong(song.id)}>
              <GripVertical className="grip" size={17}/>
              <span className="track-no">{String(index + 1).padStart(2,"0")}</span>
              <div className="cover">{song.cover || "♪"}</div>
              <div className="song-info"><h3>{song.title}</h3><p>{song.artist}</p><small>“{song.note}”</small></div>
              <div className="song-actions"><button className="edit-song" onClick={() => openEdit(song)} aria-label={`Edit ${song.title}`}><Pencil size={14}/></button><button className="play" onClick={() => toggleSong(song)} aria-label="Toggle player">{playing === song.id ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button></div>
              {playing === song.id && spotifyEmbed && <div className="embed-wrap"><iframe src={spotifyEmbed} title={`Player for ${song.title}`} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"/></div>}
              {playing === song.id && !youtubeId && !spotifyEmbed && <div className="player-note"><Headphones size={15}/> Add a Spotify or YouTube URL to enable playback. <button className="inline-edit" onClick={() => openEdit(song)}>Add link</button></div>}
            </article>;
          })}
        </div>
        <button className="add-row" onClick={() => setShowAdd(true)}><Plus size={18}/> add another song <span>+</span></button>
      </section>

      {floatingPlayer && <div className={`floating-tape-player ${tapeCorner}`} aria-live="polite">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${floatingPlayer.videoId}?autoplay=1&controls=0&playsinline=1&rel=0&fs=0&disablekb=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
          title="Mixtape audio player"
          allow="autoplay; encrypted-media; picture-in-picture"
        />
        <button
          className="floating-tape"
          onClick={() => window.open(getYouTubeWatchUrl(songs.find(song => song.id === floatingPlayer.songId)?.url || ""), "_blank", "noopener,noreferrer")}
          aria-label="Open this song on YouTube"
        >
          <span className="tape-reel tape-reel-left" />
          <span className="tape-center"><strong>OUR MIX</strong><small>now playing</small></span>
          <span className="tape-reel tape-reel-right" />
        </button>
        <button className="floating-close" onClick={() => { setFloatingPlayer(null); setPlaying(null); }} aria-label="Stop playback"><X size={13}/></button>
      </div>}

      <section className="story section">
        <div className="story-top">
          <div>
            <p className="eyebrow"><Heart size={13} fill="currentColor"/> our little timeline</p>
            <h2>All the little<br/><i>moments.</i></h2>
          </div>
          <div className="date-card">
            <span>our day</span>
            <input type="date" value={ourDate} onChange={e => saveOurDate(e.target.value)} aria-label="Our special date"/>
            {ourDate && <strong>{daysTogether()} days together ♡</strong>}
            {!ourDate && <small>pick the date our story began</small>}
          </div>
        </div>
        <div className="timeline">
          {memories.map((memory, i) => <article className="memory-card" key={memory.id}>
            <div className="memory-number">0{i + 1}</div>
            <div className="memory-image">{memory.image ? <img src={memory.image} alt="" /> : <span>add a<br/>photo ♡</span>}</div>
            <div className="memory-body">
              <p className="memory-date">{memory.date}</p>
              <h3>{memory.title}</h3>
              <p>{memory.story}</p>
            </div>
          </article>)}
        </div>
        <button className="add-memory" onClick={() => setShowMemory(true)}><Plus size={17}/> add a memory</button>
      </section>

      <section className="favorites section">
        <div className="favorites-head">
          <p className="eyebrow"><Sparkles size={13}/> little things</p>
          <h2>Things I love<br/><i>about you.</i></h2>
        </div>
        <div className="love-list">
          {["The way you laugh before you finish a joke.", "How you make ordinary days feel special.", "Your little messages that instantly fix my mood.", "The fact that somehow, you feel like home."].map((item,i)=><div className="love-item" key={item}><span>0{i+1}</span><p>{item}</p></div>)}
        </div>
      </section>

      <section className="letter section">
        <div className="letter-paper">
          <p className="hand">a note for you</p>
          <h2>Hey, you.</h2>
          <p className="letter-text">If I could put every tiny moment that made me fall for you into a box, it would probably look a lot like this. So here's a little collection of songs and memories instead.</p>
          <p className="letter-text">Thank you for being my favorite person to talk to, laugh with, annoy, miss and love. I hope whenever you press play, you remember how very, very loved you are.</p>
          <div className="miss-me">
            <p>missing me?</p>
            <button onClick={surpriseMe}><Heart size={17} fill="currentColor"/> press this</button>
            {missYouMessage && <div className="miss-message">{missYouMessage}</div>}
          </div>
          <p className="signature">always yours ♡</p>
        </div>
      </section>

      {showOwnerLogin && <div className="modal-backdrop" onMouseDown={() => setShowOwnerLogin(false)}>
        <div className="modal" onMouseDown={e => e.stopPropagation()}>
          <button className="close" onClick={() => setShowOwnerLogin(false)}><X size={19}/></button>
          <p className="eyebrow">private editing</p><h2>Unlock <i>our mixtape.</i></h2>
          <p className="owner-note">Viewing is public. Saving is private. Your owner key stays only in this browser session.</p>
          <form onSubmit={e => { e.preventDefault(); const value = e.currentTarget.elements.ownerKey.value.trim(); if (!value) return; sessionStorage.setItem("our-mixtape-owner-token", value); setOwnerToken(value); setShowOwnerLogin(false); }}>
            <label>Owner key<input name="ownerKey" type="password" autoFocus autoComplete="off" placeholder="paste your private owner key" required/></label>
            <button className="primary-btn" type="submit"><Heart size={16}/> Unlock editing</button>
          </form>
        </div>
      </div>}

      <footer><Heart size={14} fill="currentColor"/> made for two <span>·</span> V3 · our little world</footer>

      {editingSong && <div className="modal-backdrop" onMouseDown={() => setEditingSong(null)}>
        <div className="modal" onMouseDown={e => e.stopPropagation()}>
          <button className="close" onClick={() => setEditingSong(null)}><X size={19}/></button>
          <p className="eyebrow">edit track</p><h2>Make it <i>yours.</i></h2>
          <form onSubmit={saveEditedSong}>
            <label>Song title<input autoFocus value={editingSong.title} onChange={e=>setEditingSong({...editingSong,title:e.target.value})} required/></label>
            <label>Artist<input value={editingSong.artist} onChange={e=>setEditingSong({...editingSong,artist:e.target.value})}/></label>
            <label>Little message<input value={editingSong.note} onChange={e=>setEditingSong({...editingSong,note:e.target.value})}/></label>
            <label>Spotify / YouTube URL<input value={editingSong.url} onChange={e=>setEditingSong({...editingSong,url:e.target.value})} placeholder="https://www.youtube.com/watch?v=..."/></label>
            <button className="primary-btn" type="submit"><Pencil size={16}/> Save track</button>
          </form>
        </div>
      </div>}

      {showMemory && <div className="modal-backdrop" onMouseDown={() => setShowMemory(false)}>
        <div className="modal memory-modal" onMouseDown={e => e.stopPropagation()}>
          <button className="close" onClick={() => setShowMemory(false)}><X size={19}/></button>
          <p className="eyebrow">new memory</p><h2>Keep this <i>forever.</i></h2>
          <form onSubmit={addMemory}>
            <label>Memory title<input autoFocus value={newMemory.title} onChange={e=>setNewMemory({...newMemory,title:e.target.value})} placeholder="our first date" required/></label>
            <label>Date or little label<input value={newMemory.date} onChange={e=>setNewMemory({...newMemory,date:e.target.value})} placeholder="that rainy Tuesday"/></label>
            <label>What happened?<input value={newMemory.story} onChange={e=>setNewMemory({...newMemory,story:e.target.value})} placeholder="tell the tiny story"/></label>
            <label>Photo URL <input value={newMemory.image} onChange={e=>setNewMemory({...newMemory,image:e.target.value})} placeholder="optional image link"/></label>
            <button className="primary-btn" type="submit"><Heart size={16} fill="currentColor"/> Save memory</button>
          </form>
        </div>
      </div>}

      {showAdd && <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}>
        <div className="modal" onMouseDown={e => e.stopPropagation()}>
          <button className="close" onClick={() => setShowAdd(false)}><X size={19}/></button>
          <p className="eyebrow">new track</p><h2>Add it to <i>our mixtape.</i></h2>
          <form onSubmit={addSong}>
            <label>Song title<input autoFocus value={newSong.title} onChange={e=>setNewSong({...newSong,title:e.target.value})} placeholder="the song that reminds you of us" required/></label>
            <label>Artist<input value={newSong.artist} onChange={e=>setNewSong({...newSong,artist:e.target.value})} placeholder="who made it?"/></label>
            <label>Little message<input value={newSong.note} onChange={e=>setNewSong({...newSong,note:e.target.value})} placeholder="why this one?"/></label>
            <label>Spotify / YouTube URL <input value={newSong.url} onChange={e=>setNewSong({...newSong,url:e.target.value})} placeholder="https://open.spotify.com/track/..."/></label>
            <button className="primary-btn" type="submit"><Music2 size={16}/> Add to mixtape</button>
          </form>
        </div>
      </div>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
