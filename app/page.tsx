"use client";

import { useEffect, useState } from "react";

type View = "browse" | "ai" | "post" | "mine" | "chat" | "detail";
type Item = {
  id: number;
  name: string;
  place: string;
  category: string;
  heldAt: string;
  bg: string;
  photo?: string;
  mine: boolean;
  claimed: boolean;
};
type Msg = { from: "me" | "them"; text: string };
type Thread = { id: number; with: string; itemId: number; itemName: string; messages: Msg[] };

const categories = ["All", "Bags", "Keys", "IDs", "Tech"];
const postCategories = categories.slice(1);

const seedItems: Item[] = [
  { id: 1, name: "Black backpack", place: "Library, 2nd floor", category: "Bags", heldAt: "Campus security office", bg: "var(--p1)", mine: false, claimed: false },
  { id: 2, name: "Keys with tag", place: "Student Union", category: "Keys", heldAt: "Student Union desk", bg: "var(--p2)", mine: false, claimed: false },
  { id: 3, name: "Student ID", place: "Science Hall", category: "IDs", heldAt: "Science Hall office", bg: "var(--p3)", mine: false, claimed: false },
  { id: 4, name: "Wireless earbuds", place: "Gym lobby", category: "Tech", heldAt: "Gym front desk", bg: "var(--p4)", mine: false, claimed: false },
  { id: 5, name: "Dark gym bag", place: "Gym lobby", category: "Bags", heldAt: "Gym front desk", bg: "var(--p3)", mine: false, claimed: false },
];

const seedThreads: Thread[] = [
  {
    id: 1,
    with: "Campus security",
    itemId: 1,
    itemName: "Black backpack",
    messages: [{ from: "them", text: "Hi! Can you describe what is inside the backpack?" }],
  },
];

const stop = new Set(["the", "and", "with", "near", "lost", "last", "was", "for", "that", "this", "from", "have", "has", "had", "tuesday", "monday", "wednesday", "thursday", "friday", "my", "a", "on", "in", "at", "of", "to", "is", "it", "i"]);

function score(query: string, item: Item) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w));
  const hay = `${item.name} ${item.place} ${item.category} ${item.heldAt}`.toLowerCase();
  return words.filter((w) => hay.includes(w.replace(/s$/, ""))).length;
}

export default function Home() {
  const [view, setView] = useState<View>("browse");
  const [dark, setDark] = useState(false);
  const [items, setItems] = useState<Item[]>(seedItems);
  const [threads, setThreads] = useState<Thread[]>(seedThreads);

  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);

  const [aiText, setAiText] = useState("");
  const [aiResults, setAiResults] = useState<{ item: Item; s: number }[] | null>(null);

  const [form, setForm] = useState({ name: "", place: "", heldAt: "", category: "Bags" });
  const [photo, setPhoto] = useState<string | undefined>();
  const [error, setError] = useState("");

  const [openThread, setOpenThread] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {}
    if (saved === "dark" || saved === "light") {
      document.documentElement.setAttribute("data-theme", saved);
      setDark(saved === "dark");
    } else {
      setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
  }, []);

  function toggleTheme() {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setDark(!dark);
  }

  const filtered = items.filter((i) => {
    const okCat = category === "All" || i.category === category;
    const q = query.trim().toLowerCase();
    const okQ = !q || `${i.name} ${i.place} ${i.category}`.toLowerCase().includes(q);
    return okCat && okQ;
  });

  function openItem(item: Item) {
    setSelected(item);
    setView("detail");
  }

  function claim(id: number) {
    setItems(items.map((i) => (i.id === id ? { ...i, claimed: true } : i)));
    setSelected((s) => (s && s.id === id ? { ...s, claimed: true } : s));
  }

  function messageFinder(item: Item) {
    let t = threads.find((x) => x.itemId === item.id);
    if (!t) {
      t = { id: Date.now(), with: "Finder", itemId: item.id, itemName: item.name, messages: [] };
      setThreads([t, ...threads]);
    }
    setOpenThread(t.id);
    setView("chat");
  }

  function runAi() {
    if (!aiText.trim()) {
      setAiResults(null);
      return;
    }
    const r = items
      .map((item) => ({ item, s: score(aiText, item) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    setAiResults(r);
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPhoto(URL.createObjectURL(f));
  }

  function postItem(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.place.trim()) {
      setError("Add an item name and where you found it.");
      return;
    }
    const it: Item = {
      id: Date.now(),
      name: form.name.trim(),
      place: form.place.trim(),
      category: form.category,
      heldAt: form.heldAt.trim() || "With the finder",
      bg: "var(--p1)",
      photo,
      mine: true,
      claimed: false,
    };
    setItems([it, ...items]);
    setForm({ name: "", place: "", heldAt: "", category: "Bags" });
    setPhoto(undefined);
    setError("");
    setView("mine");
  }

  function sendMsg(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || openThread === null) return;
    setThreads(
      threads.map((t) =>
        t.id === openThread ? { ...t, messages: [...t.messages, { from: "me", text: draft.trim() }] } : t
      )
    );
    setDraft("");
  }

  const activeThread = threads.find((t) => t.id === openThread);
  const myItems = items.filter((i) => i.mine);
  const tab = view === "detail" ? "browse" : view;

  const thumb = (i: Item, cls: string) =>
    i.photo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={cls} src={i.photo} alt={i.name} />
    ) : (
      <div className={cls} style={{ background: i.bg }}>Photo</div>
    );

  return (
    <>
      <main>
        <div className="row">
          <h1 className="brand">
            <img src="/icon.svg" alt="" width={40} height={40} />
            LostSignal</h1>
          <button className="tog" onClick={toggleTheme} aria-pressed={dark}>
            Dark mode: {dark ? "on" : "off"}
          </button>
        </div>

        {view === "browse" && (
          <section>
            <div className="sbar">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search found items…"
                aria-label="Search found items"
              />
              <button className="ai" onClick={() => setView("ai")}>AI</button>
            </div>
            <div className="cats">
              {categories.map((c) => (
                <button key={c} className={"cat" + (category === c ? " on" : "")} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
            <h2>Recently found</h2>
            {filtered.length === 0 ? (
              <p className="empty">Nothing matches. Try AI search or a different word.</p>
            ) : (
              <div className="grid">
                {filtered.map((item) => (
                  <button className="card" key={item.id} onClick={() => openItem(item)}>
                    {thumb(item, "ph")}
                    <div className="t">
                      <b>{item.name}</b>
                      <span>{item.place}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "detail" && selected && (
          <section>
            <button className="back" onClick={() => setView("browse")}>← Back</button>
            {thumb(selected, "hero")}
            <h2 style={{ fontSize: 22, marginTop: 14 }}>{selected.name}</h2>
            <div className="tags"><span className="tag">{selected.category}</span></div>
            <div className="info">
              <div><b>Found at:</b> {selected.place}</div>
              <div><b>Held at:</b> {selected.heldAt}</div>
            </div>
            <button className="big" disabled={selected.claimed} onClick={() => claim(selected.id)}>
              {selected.claimed ? "Claim requested" : "This is mine"}
            </button>
            <button className="btn2" onClick={() => messageFinder(selected)}>Message finder</button>
          </section>
        )}

        {view === "ai" && (
          <section>
            <h2 style={{ fontSize: 20 }}>Find my item</h2>
            <p className="note">Describe what you lost. This demo matches by keywords; connect a real AI model later.</p>
            <textarea
              className="box"
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder="Black backpack with a red keychain, lost near the library"
              aria-label="Describe your lost item"
            />
            <button className="big" onClick={runAi}>Search with AI</button>
            {aiResults && (
              <>
                <h2>Top matches</h2>
                {aiResults.length === 0 && <p className="empty">No matches yet. Check back soon.</p>}
                {aiResults.map(({ item, s }) => (
                  <button className="match" key={item.id} onClick={() => openItem(item)}>
                    {thumb(item, "th")}
                    <div>
                      <b>{item.name}</b>
                      <div className="sub">{item.place}</div>
                      <span className="tag">{s >= 2 ? "Strong match" : "Possible match"}</span>
                    </div>
                  </button>
                ))}
              </>
            )}
          </section>
        )}

        {view === "post" && (
          <form onSubmit={postItem}>
            <h2 style={{ fontSize: 20 }}>Post a found item</h2>
            <label className="snap">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="Your photo" className="prev" />
              ) : (
                "Take a photo"
              )}
              <input type="file" accept="image/*" capture="environment" onChange={onPhoto} hidden />
            </label>
            <label className="field">
              Item name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Black backpack" />
            </label>
            <label className="field">
              Category
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {postCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Where did you find it?
              <input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="Library, 2nd floor" />
            </label>
            <label className="field">
              Where is it now?
              <input value={form.heldAt} onChange={(e) => setForm({ ...form, heldAt: e.target.value })} placeholder="With me / Security office" />
            </label>
            {error && <p className="err" role="alert">{error}</p>}
            <button className="big" type="submit">Post item</button>
          </form>
        )}

        {view === "mine" && (
          <section>
            <h2 style={{ fontSize: 20 }}>My items</h2>
            {myItems.length === 0 ? (
              <p className="empty">You have not posted anything yet. Tap + to post a found item.</p>
            ) : (
              myItems.map((item) => (
                <div className="match" key={item.id}>
                  {thumb(item, "th")}
                  <div style={{ flex: 1 }}>
                    <b>{item.name}</b>
                    <div className="sub">{item.place}</div>
                    <button className="small" onClick={() => setItems(items.filter((i) => i.id !== item.id))}>Remove</button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {view === "chat" && !activeThread && (
          <section>
            <h2 style={{ fontSize: 20 }}>Messages</h2>
            {threads.length === 0 ? (
              <p className="empty">No messages yet. Open an item and tap Message finder.</p>
            ) : (
              threads.map((t) => (
                <button className="match" key={t.id} onClick={() => setOpenThread(t.id)}>
                  <div>
                    <b>{t.with}</b>
                    <div className="sub">About: {t.itemName}</div>
                    <div className="sub">{t.messages.length ? t.messages[t.messages.length - 1].text : "No messages yet"}</div>
                  </div>
                </button>
              ))
            )}
          </section>
        )}

        {view === "chat" && activeThread && (
          <section>
            <button className="back" onClick={() => setOpenThread(null)}>← All messages</button>
            <h2 style={{ fontSize: 20 }}>{activeThread.with}</h2>
            <div className="sub">About: {activeThread.itemName}</div>
            <div className="msgs">
              {activeThread.messages.length === 0 && <p className="empty">Say hello and describe your item.</p>}
              {activeThread.messages.map((m, i) => (
                <div key={i} className={"bubble " + m.from}>{m.text}</div>
              ))}
            </div>
            <form className="send" onSubmit={sendMsg}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message…" aria-label="Message" />
              <button type="submit">Send</button>
            </form>
          </section>
        )}
      </main>

      <nav>
        <div>
          <button className={tab === "browse" ? "on" : ""} onClick={() => setView("browse")}>Browse</button>
          <button className={tab === "ai" ? "on" : ""} onClick={() => setView("ai")}>AI search</button>
          <button className="plus" aria-label="Post found item" onClick={() => setView("post")}>+</button>
          <button className={tab === "mine" ? "on" : ""} onClick={() => setView("mine")}>My items</button>
          <button className={tab === "chat" ? "on" : ""} onClick={() => { setOpenThread(null); setView("chat"); }}>Messages</button>
        </div>
      </nav>
    </>
  );
}