import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { Wordmark } from '../components/Brand.jsx';
import { ACCENTS, langColor, fmt, copy, siteHost } from '../util.js';

const MAX = 12;

export default function Dashboard() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [repos, setRepos] = useState(null);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Dashboard — GitScoop'; }, []);

  // Leave only when the session itself is gone.
  useEffect(() => { if (user === null) nav('/', { replace: true }); }, [user, nav]);

  useEffect(() => {
    if (!user) return;
    Promise.all([api('/me/repos'), api('/me/portfolio')])
      .then(([r, p]) => { setRepos(r.repos); setForm(p.portfolio); setSaved(p.portfolio); })
      .catch((e) => {
        setError(e.message);
        // 401 can also mean "GitHub rejected the saved token". Only redirect for a lost session.
        if (e.status === 401 && e.message === 'Sign in to continue') nav('/', { replace: true });
      });
  }, [user, nav]);

  const byName = useMemo(() => Object.fromEntries((repos || []).map((r) => [r.name, r])), [repos]);
  const filtered = useMemo(
    () => (repos || []).filter((r) => (r.name + (r.description || '') + (r.language || '')).toLowerCase().includes(q.toLowerCase())),
    [repos, q]
  );
  const dirty = form && saved && JSON.stringify(form) !== JSON.stringify({ ...saved, views: form.views, updated_at: form.updated_at });

  if (!user || !form) {
    return (
      <div className="boot" role="status">
        {!error && <span className="loader" />}
        <p>{error || 'Fetching your repos…'}</p>
        {error && <a className="btn btn-primary" href="/api/auth/github">Sign in with GitHub again</a>}
      </div>
    );
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggle = (name) => {
    if (form.repos.includes(name)) return set({ repos: form.repos.filter((n) => n !== name) });
    if (form.repos.length >= MAX) return toast(`You can pick up to ${MAX} projects. Remove one first.`, 'warn');
    set({ repos: [...form.repos, name] });
  };
  const move = (i, d) => {
    const a = [...form.repos];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set({ repos: a });
  };
  const save = async (publish) => {
    setSaving(true);
    setError('');
    try {
      const body = { headline: form.headline, about: form.about, accent: form.accent, repos: form.repos, published: publish ?? form.published };
      const { portfolio } = await api('/me/portfolio', { method: 'PUT', body });
      setForm(portfolio);
      setSaved(portfolio);
      toast(publish === true && !saved.published ? 'Published' : 'Saved');
    } catch (e) {
      setError(e.message);
      toast(e.message, 'warn');
    }
    setSaving(false);
  };

  const link = `${window.location.origin}/u/${user.username}`;

  return (
    <div className="dash">
      <header className="dash-top wrap">
        <Wordmark />
        <div className="dash-user">
          <img src={user.avatar} alt="" width="30" height="30" />
          <span>{user.username}</span>
          <button className="btn-mini" onClick={async () => { await logout(); nav('/'); }}>Sign out</button>
        </div>
      </header>

      <div className="dash-grid wrap">
        <section className="picker" aria-labelledby="pick-h">
          <div className="picker-head">
            <div>
              <h1 id="pick-h">Choose your projects</h1>
              <p className="muted">Pick up to {MAX}. The order you pick them in is the order they appear.</p>
            </div>
            <input
              className="search"
              type="search"
              placeholder="Search by name, language…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search repositories"
            />
          </div>

          {repos.length === 0 ? (
            <div className="empty"><p>You have no public repositories yet. Push one to GitHub and refresh.</p></div>
          ) : filtered.length === 0 ? (
            <div className="empty"><p>No repo matches “{q}”.</p></div>
          ) : (
            <ul className="rlist">
              {filtered.map((r) => {
                const idx = form.repos.indexOf(r.name);
                const on = idx >= 0;
                return (
                  <li key={r.name}>
                    <button className={`rcard ${on ? 'on' : ''}`} onClick={() => toggle(r.name)} aria-pressed={on}>
                      <span className="pick-mark" aria-hidden="true">{on ? idx + 1 : ''}</span>
                      <span className="rc-main">
                        <b>{r.name}{r.fork && <em>fork</em>}</b>
                        <span className="rc-desc">{r.description || 'No description'}</span>
                        <span className="rc-meta">
                          {r.language && <span><i style={{ background: langColor(r.language) }} />{r.language}</span>}
                          <span>★ {fmt(r.stars)}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="panel" aria-label="Portfolio settings">
          <div className="panel-top">
            <h2>Your portfolio</h2>
            <p className={`status ${form.published ? 'live' : ''}`}>
              {form.published ? `Published · ${form.views} views` : 'Draft'}
            </p>
          </div>

          <div className="slots" aria-label={`${form.repos.length} of ${MAX} projects selected`}>
            {Array.from({ length: MAX }, (_, i) => <i key={i} className={i < form.repos.length ? 'f' : ''} />)}
          </div>

          <ol className="sel">
            {form.repos.length === 0 && <li className="sel-empty">Nothing picked yet. Click a repo to add it.</li>}
            {form.repos.map((n, i) => (
              <li key={n}>
                <span className="sel-n">{i + 1}</span>
                <span className="sel-name">{n}{!byName[n] && <em> (not in list)</em>}</span>
                <button className="ib" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${n} up`}>↑</button>
                <button className="ib" onClick={() => move(i, 1)} disabled={i === form.repos.length - 1} aria-label={`Move ${n} down`}>↓</button>
                <button className="ib" onClick={() => toggle(n)} aria-label={`Remove ${n}`}>×</button>
              </li>
            ))}
          </ol>

          <label className="field">
            <span>Headline <small>{form.headline.length}/90</small></span>
            <input
              value={form.headline}
              maxLength={90}
              onChange={(e) => set({ headline: e.target.value })}
              placeholder="Backend engineer. Go, Postgres, distributed systems."
            />
          </label>
          <label className="field">
            <span>About <small>{form.about.length}/600</small></span>
            <textarea
              rows={4}
              value={form.about}
              maxLength={600}
              onChange={(e) => set({ about: e.target.value })}
              placeholder="What you build, what you’re looking for, how to reach you."
            />
          </label>
          <fieldset className="field">
            <legend>Accent color</legend>
            <div className="swatches">
              {Object.entries(ACCENTS).map(([k, v]) => (
                <button
                  key={k}
                  className={form.accent === k ? 'on' : ''}
                  style={{ background: v }}
                  onClick={() => set({ accent: k })}
                  aria-label={k}
                  aria-pressed={form.accent === k}
                />
              ))}
            </div>
          </fieldset>

          {error && <p className="err" role="alert">{error}</p>}

          <div className="panel-actions">
            {form.published ? (
              <button className="btn btn-primary" disabled={saving || !dirty} onClick={() => save()}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={saving || form.repos.length === 0} onClick={() => save(true)}>
                {saving ? 'Publishing…' : 'Publish portfolio'}
              </button>
            )}
            <Link className="btn btn-ghost" to={`/u/${user.username}`} target="_blank">Preview</Link>
          </div>
          {!form.published && form.repos.length === 0 && <p className="fine">Pick at least one project to publish.</p>}

          {form.published && (
            <div className="share">
              <span className="share-l">Your link</span>
              <code>{siteHost()}/u/{user.username}</code>
              <button className="btn-mini" onClick={async () => toast((await copy(link)) ? 'Link copied' : 'Copy failed')}>Copy</button>
              <button className="btn-mini" disabled={saving} onClick={() => save(false)}>Unpublish</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}