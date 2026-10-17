import { useEffect, useState } from 'react';
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

  useEffect(() => {
    document.title = 'Explore developer portfolios — GitScoop';
    api('/explore').then((d) => setPeople(d.people)).catch((e) => setErr(e.message));
  }, []);

  const shown = (people || []).filter((p) =>
    `${p.name || ''} ${p.username} ${p.headline || ''}`.toLowerCase().includes(q.toLowerCase())
  );

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
            placeholder="Search by name or headline…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search portfolios"
          />

          {err && <p className="err" role="alert">{err}</p>}
          {!people && !err && <div className="boot" role="status"><span className="loader" /></div>}
          {people && people.length === 0 && (
            <div className="empty">
              <p>Nobody is listed yet. Be the first: publish your portfolio and tick “List me on Explore”.</p>
              {!user && <a className="btn btn-primary" href="/api/auth/github"><GithubIcon size={16} /> Sign in with GitHub</a>}
            </div>
          )}
          {people && people.length > 0 && shown.length === 0 && <div className="empty"><p>No one matches “{q}”.</p></div>}

          <ul className="ex-grid">
            {shown.map((p) => (
              <li key={p.username}>
                <Link className="ex-card" to={`/u/${p.username}`} style={{ '--accent': ACCENTS[p.accent] || ACCENTS.red }}>
                  <img src={p.avatar} alt="" width="56" height="56" loading="lazy" />
                  <span className="ex-main">
                    <b>{p.name || p.username}</b>
                    <span className="ex-handle">@{p.username}</span>
                    {p.headline && <span className="ex-head">{p.headline}</span>}
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