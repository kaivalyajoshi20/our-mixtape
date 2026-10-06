import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Heart, Music2, Plus, GripVertical, Play, Pause, Sparkles, X, Link2 } from "lucide-react";
import "./styles.css";

const starterSongs = [
  { id: 1, title: "Our first song", artist: "add an artist", note: "The one that makes me think of you.", cover: "♪" },
  { id: 2, title: "That one we played on repeat", artist: "your favorite artist", note: "Some songs just become memories.", cover: "♫" },
  { id: 3, title: "For the late nights", artist: "your soundtrack", note: "For every little moment after midnight.", cover: "♬" }
];

function App() {
  const [songs, setSongs] = useState(starterSongs);
  const [playing, setPlaying] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newSong, setNewSong] = useState({ title: "", artist: "", note: "" });

  const total = songs.length;
  const shareUrl = useMemo(() => window.location.href, []);

  function addSong(e) {
    e.preventDefault();
    if (!newSong.title.trim()) return;
    setSongs((current) => [...current, {
      id: Date.now(),
      title: newSong.title.trim(),
      artist: newSong.artist.trim() || "unknown artist",
      note: newSong.note.trim() || "A song I wanted you to have.",
      cover: "♪"
    }]);
    setNewSong({ title: "", artist: "", note: "" });
    setShowAdd(false);
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
        <button className="share-btn" onClick={share}><Link2 size={15}/>{copied ? "Copied!" : "Share"}</button>
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
        <div className="cassette-wrap" aria-label="decorative cassette">
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
          <span className="count">{String(total).padStart(2,"0")} tracks</span>
        </div>
        <div className="song-list">
          {songs.map((song, index) => (
            <article className={`song-card ${playing === song.id ? "is-playing" : ""}`} key={song.id}>
              <GripVertical className="grip" size={17}/>
              <span className="track-no">{String(index + 1).padStart(2,"0")}</span>
              <div className="cover">{song.cover}</div>
              <div className="song-info"><h3>{song.title}</h3><p>{song.artist}</p><small>“{song.note}”</small></div>
              <button className="play" onClick={() => setPlaying(playing === song.id ? null : song.id)} aria-label="Play song">
                {playing === song.id ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
              </button>
            </article>
          ))}
        </div>
        <button className="add-row" onClick={() => setShowAdd(true)}><Plus size={18}/> add another song <span>+</span></button>
      </section>

      <section className="memories section">
        <div className="memory-copy">
          <p className="eyebrow"><Sparkles size={13}/> little things</p>
          <h2>My favorite<br/><i>things about you.</i></h2>
          <div className="love-list">
            {["The way you laugh before you finish a joke.", "How you make ordinary days feel special.", "Your little messages that instantly fix my mood.", "The fact that somehow, you feel like home."].map((item,i)=><div className="love-item" key={item}><span>0{i+1}</span><p>{item}</p></div>)}
          </div>
        </div>
        <div className="photo-stack">
          <div className="photo photo-one"><span>your photo<br/>goes here</span></div>
          <div className="photo photo-two"><span>and another<br/>little memory ♡</span></div>
          <p className="caption">proof that my favorite place<br/>is wherever you are.</p>
        </div>
      </section>

      <section className="letter section">
        <div className="letter-paper">
          <p className="hand">a note for you</p>
          <h2>Hey, you.</h2>
          <p className="letter-text">If I could put every tiny moment that made me fall for you into a box, it would probably look a lot like this. So here's a little collection of songs and memories instead.</p>
          <p className="letter-text">Thank you for being my favorite person to talk to, laugh with, annoy, miss and love. I hope whenever you press play, you remember how very, very loved you are.</p>
          <p className="signature">always yours ♡</p>
        </div>
      </section>

      <footer><Heart size={14} fill="currentColor"/> made for two <span>·</span> side B coming soon</footer>

      {showAdd && <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}>
        <div className="modal" onMouseDown={e => e.stopPropagation()}>
          <button className="close" onClick={() => setShowAdd(false)}><X size={19}/></button>
          <p className="eyebrow">new track</p><h2>Add it to <i>our mixtape.</i></h2>
          <form onSubmit={addSong}>
            <label>Song title<input autoFocus value={newSong.title} onChange={e=>setNewSong({...newSong,title:e.target.value})} placeholder="the song that reminds you of us"/></label>
            <label>Artist<input value={newSong.artist} onChange={e=>setNewSong({...newSong,artist:e.target.value})} placeholder="who made it?"/></label>
            <label>Little message<input value={newSong.note} onChange={e=>setNewSong({...newSong,note:e.target.value})} placeholder="why this one?"/></label>
            <button className="primary-btn" type="submit"><Music2 size={16}/> Add to mixtape</button>
          </form>
        </div>
      </div>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
