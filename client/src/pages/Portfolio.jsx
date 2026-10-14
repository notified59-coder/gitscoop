import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ACCENTS, langColor, fmt, ago, copy } from '../util.js';
import NotFound from './NotFound.jsx';
import ThemeToggle, { useTheme } from '../components/ThemeToggle.jsx';
import { useToast } from '../components/Toast.jsx';

const icon = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const GlobeIcon = () => (<svg {...icon}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" /></svg>);
const LinkedInIcon = () => (<svg {...icon}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 11v5M8 8v.01M12 16v-5m0 2.5c0-1.5 1-2.5 2.3-2.5s1.7 1 1.7 2.5V16" /></svg>);
const FileIcon = () => (<svg {...icon}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>);

// Only ever render http(s) links, whatever is stored.
const safeHref = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

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
  const links = portfolio.links || {};
  const email = links.email || '';
  const extra = [
    { href: safeHref(links.website), label: 'Website', Icon: GlobeIcon },
    { href: safeHref(links.linkedin), label: 'LinkedIn', Icon: LinkedInIcon },
    { href: safeHref(links.resume), label: 'Résumé', Icon: FileIcon },
  ].filter((l) => l.href);

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
            {email && <a className="btn btn-primary" href={`mailto:${email}`}>Email {user.name?.split(' ')[0] || user.username}</a>}
            <a className={`btn ${email ? '' : 'btn-primary'}`} href={user.github} target="_blank" rel="noopener noreferrer">View GitHub profile</a>
            <button
              className="btn"
              onClick={async () => toast((await copy(window.location.href)) ? 'Link copied' : 'Copy failed')}
            >
              Copy link
            </button>
          </div>
          {extra.length > 0 && (
            <ul className="pf-links" aria-label="Links">
              {extra.map(({ href, label, Icon }) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="noopener noreferrer"><Icon /> {label}</a>
                </li>
              ))}
            </ul>
          )}
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
                  <Link to={`/u/${user.username}/${r.name}${r.file ? `?file=${encodeURIComponent(r.file)}` : ''}`} className="row">
                    <span className="row-n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="row-main">
                      <h2>{r.name}</h2>
                      <span className="row-desc">{r.blurb || r.description || 'No description yet. Open it to read the code.'}</span>
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

      {email && (
        <section className="pf-contact wrap" aria-labelledby="contact-h">
          <h2 id="contact-h">Want to work together?</h2>
          <div className="pf-contact-r">
            <a className="pf-mail" href={`mailto:${email}`}>{email}</a>
          </div>
        </section>
      )}

      <footer className="pf-foot">
        <div className="wrap pf-foot-in">
          <p>Want a page like this? <a href="/">Make yours on GitScoop</a>.</p>
        </div>
      </footer>
    </div>
  );
}