import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ACCENTS } from '../util.js';
import { Wordmark, GithubIcon } from '../components/Brand.jsx';
import Footer from '../components/Footer.jsx';
import { useAuth } from '../auth.jsx';

export default function Explore() {
  const { user } = useAuth();
  const [people, setPeople] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [lang, setLang] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState('views');

  useEffect(() => {
    document.title = 'Explore developer portfolios — GitScoop';
    api('/explore').then((d) => setPeople(d.people)).catch((e) => setErr(e.message));
  }, []);

  // The most common languages across everyone listed, for the filter chips.
  const langs = useMemo(() => {
    const count = {};
    (people || []).forEach((p) => p.langs.forEach((l) => { count[l] = (count[l] || 0) + 1; }));
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [people]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (people || []).filter((p) => {
      if (lang && !p.langs.includes(lang)) return false;
      if (openOnly && !p.open) return false;
      if (!needle) return true;
      const hay = `${p.name || ''} ${p.username} ${p.headline || ''} ${p.langs.join(' ')} ${p.topics.join(' ')}`.toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
    const by = {
      views: (a, b) => b.views - a.views,
      new: (a, b) => b.updated_at - a.updated_at,
      projects: (a, b) => b.projects - a.projects,
    }[sort];
    return [...list].sort(by);
  }, [people, q, lang, openOnly, sort]);

  const filtering = q || lang || openOnly;
  const clear = () => { setQ(''); setLang(''); setOpenOnly(false); };

  return (
    <div className="landing">
      <header className="top">
        <div className="wrap top-in">
          <Wordmark />
          <nav aria-label="Primary">
            <Link to="/">Home</Link>
            {user
              ? <Link className="btn btn-sm" to="/dashboard">Dashboard</Link>
              : <a className="btn btn-sm" href="/api/auth/github">Sign in</a>}
          </nav>
        </div>
      </header>

      <section className="sec">
        <div className="wrap">
          <h1 className="ex-title">Explore portfolios</h1>
          <p className="lede sm">Developers who chose to be listed. Click a name to read their projects.</p>
          <input
            className="search ex-search"
            type="search"
            placeholder="Search name, headline, language or topic…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search portfolios"
          />

          <div className="ex-filters">
            <div className="ex-chips" role="group" aria-label="Filter by language">
              <button type="button" className="ex-chip" aria-pressed={!lang} onClick={() => setLang('')}>All</button>
              {langs.map(([l, n]) => (
                <button key={l} type="button" className="ex-chip" aria-pressed={lang === l} onClick={() => setLang(lang === l ? '' : l)}>
                  {l} <span className="ex-n">{n}</span>
                </button>
              ))}
            </div>
            <div className="ex-tools">
              <label className="ex-check">
                <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open to work
              </label>
              <select className="ex-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort portfolios">
                <option value="views">Most viewed</option>
                <option value="new">Recently updated</option>
                <option value="projects">Most projects</option>
              </select>
            </div>
          </div>
          {people && people.length > 0 && (
            <p className="ex-count" role="status">
              {shown.length} of {people.length} portfolio{people.length === 1 ? '' : 's'}
              {filtering && <> · <button type="button" className="ex-clear" onClick={clear}>Clear filters</button></>}
            </p>
          )}

          {err && <p className="err" role="alert">{err}</p>}
          {!people && !err && <div className="boot" role="status"><span className="loader" /></div>}
          {people && people.length === 0 && (
            <div className="empty">
              <p>Nobody is listed yet. Be the first: publish your portfolio and tick “List me on Explore”.</p>
              {!user && <a className="btn btn-primary" href="/api/auth/github"><GithubIcon size={16} /> Sign in with GitHub</a>}
            </div>
          )}
          {people && people.length > 0 && shown.length === 0 && (
            <div className="empty">
              <p>No portfolios match these filters.</p>
              <button type="button" className="btn" onClick={clear}>Clear filters</button>
            </div>
          )}

          <ul className="ex-grid">
            {shown.map((p) => (
              <li key={p.username}>
                <Link className="ex-card" to={`/u/${p.username}`} style={{ '--accent': ACCENTS[p.accent] || ACCENTS.red }}>
                  <img src={p.avatar} alt="" width="56" height="56" loading="lazy" />
                  <span className="ex-main">
                    <b>{p.name || p.username}</b>
                    <span className="ex-handle">@{p.username}</span>
                    {p.headline && <span className="ex-head">{p.headline}</span>}
                    {p.open && <span className="ex-open">Open to work</span>}
                    {p.langs.length > 0 && <span className="ex-tags">{p.langs.slice(0, 4).map((l) => <span key={l}>{l}</span>)}</span>}
                    <span className="ex-meta">{p.projects} project{p.projects === 1 ? '' : 's'} · {p.views} views</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <Footer />
    </div>
  );
}