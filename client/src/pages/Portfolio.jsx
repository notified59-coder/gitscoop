import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ACCENTS, langColor, fmt, ago, copy } from '../util.js';
import NotFound from './NotFound.jsx';
import ThemeToggle, { useTheme } from '../components/ThemeToggle.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Portfolio() {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [theme, setTheme] = useTheme();
  const toast = useToast();

  useEffect(() => {
    setData(null);
    setErr(null);
    api(`/p/${username}`)
      .then((d) => {
        setData(d);
        document.title = `${d.user.name || d.user.username} — developer portfolio`;
        api(`/p/${username}/view`, { method: 'POST' }).catch(() => {});
      })
      .catch((e) => setErr(e));
  }, [username]);

  if (err) {
    return (
      <NotFound
        title="No portfolio here"
        body={err.status === 429 ? err.message : `We couldn’t find a published portfolio for ${username}.`}
      />
    );
  }
  if (!data) return <div className="boot" role="status"><span className="loader" /></div>;

  const { user, portfolio, repos, languages, isOwner } = data;
  const stars = repos.reduce((a, r) => a + r.stars, 0);

  return (
    <div className="pf" data-theme={theme} style={{ '--accent': ACCENTS[portfolio.accent] || ACCENTS.red }}>
      <div className="pf-top">
        <div className="wrap pf-top-in">
          <a className="pf-brand" href="/">
            <img src="/brand/logo.svg" alt="" height="22" /> <span>Made with GitScoop</span>
          </a>
          <div className="pf-top-r">
            {isOwner && !portfolio.published && <span className="badge">Draft preview, only you can see this</span>}
            {isOwner && <Link className="btn-mini" to="/dashboard">Edit</Link>}
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>
      </div>

      <header className="pf-head wrap">
        <img className="avatar" src={user.avatar} alt={`${user.username}’s avatar`} width="112" height="112" />
        <div className="pf-id">
          <h1>{user.name || user.username}</h1>
          <p className="handle">@{user.username}</p>
          {portfolio.headline && <p className="pf-headline">{portfolio.headline}</p>}
          {portfolio.about && <p className="pf-about">{portfolio.about}</p>}
          <div className="pf-actions">
            <a className="btn btn-primary" href={user.github} target="_blank" rel="noopener noreferrer">View GitHub profile</a>
            <button
              className="btn"
              onClick={async () => toast((await copy(window.location.href)) ? 'Link copied' : 'Copy failed')}
            >
              Copy link
            </button>
          </div>
        </div>
        <dl className="pf-stats">
          <div><dt>Projects</dt><dd>{repos.length}</dd></div>
          <div><dt>Total stars</dt><dd>{fmt(stars)}</dd></div>
        </dl>
      </header>

      {languages.length > 0 && (
        <section className="wrap langs" aria-label="Languages across selected projects">
          <div className="langbar">
            {languages.map((l) => (
              <i key={l.name} style={{ width: `${l.pct}%`, background: langColor(l.name) }} title={`${l.name} ${l.pct}%`} />
            ))}
          </div>
          <ul>
            {languages.map((l) => (
              <li key={l.name}>
                <span style={{ background: langColor(l.name) }} />{l.name} <b>{l.pct}%</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <main className="wrap">
        {repos.length === 0 ? (
          <div className="empty"><p>No projects selected yet.</p></div>
        ) : (
          <>
            <p className="index-label">Selected work</p>
            <ol className="index">
              {repos.map((r, i) => (
                <li key={r.name}>
                  <Link to={`/u/${user.username}/${r.name}`} className="row">
                    <span className="row-n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="row-main">
                      <h2>{r.name}</h2>
                      <span className="row-desc">{r.description || 'No description yet. Open it to read the code.'}</span>
                      {r.topics.length > 0 && (
                        <span className="tags">{r.topics.slice(0, 5).map((t) => <span key={t}>{t}</span>)}</span>
                      )}
                    </span>
                    <span className="row-meta">
                      {r.language && <span><i style={{ background: langColor(r.language) }} />{r.language}</span>}
                      <span>★ {fmt(r.stars)} · ⑂ {fmt(r.forks)}</span>
                      <span>Updated {ago(r.pushed_at)}</span>
                    </span>
                    <span className="row-go" aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>

      <footer className="pf-foot">
        <div className="wrap pf-foot-in">
          <p>Want a page like this? <a href="/">Make yours on GitScoop</a>.</p>
        </div>
      </footer>
    </div>
  );
}