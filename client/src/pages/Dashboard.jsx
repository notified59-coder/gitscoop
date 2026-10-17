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
  const [editing, setEditing] = useState(null); // repo whose description is being edited

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
  const setLink = (key, value) => setForm((f) => ({ ...f, links: { ...f.links, [key]: value } }));
  const setNote = (name, patch) =>
    setForm((f) => ({ ...f, notes: { ...f.notes, [name]: { blurb: '', file: '', image: '', highlights: [], ...f.notes?.[name], ...patch } } }));
  const hasNote = (name) => {
    const n = form.notes?.[name] || {};
    return !!(n.blurb || n.file || n.image || (n.highlights || []).some(Boolean));
  };
  const setHighlight = (name, i, value) => {
    const cur = form.notes?.[name]?.highlights || [];
    const next = [cur[0] || '', cur[1] || '', cur[2] || ''];
    next[i] = value;
    setNote(name, { highlights: next });
  };

  // Open-to-work, featured project, experience and education all live in form.extra.
  const setExtra = (patch) => setForm((f) => ({ ...f, extra: { ...f.extra, ...patch } }));
  const setFeatured = (patch) => setForm((f) => ({ ...f, extra: { ...f.extra, featured: { ...f.extra.featured, ...patch } } }));
  const setItem = (key, i, patch) =>
    setForm((f) => ({ ...f, extra: { ...f.extra, [key]: f.extra[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) } }));
  const addItem = (key, blank, max) =>
    setForm((f) => (f.extra[key].length >= max ? f : { ...f, extra: { ...f.extra, [key]: [...f.extra[key], blank] } }));
  const removeItem = (key, i) =>
    setForm((f) => ({ ...f, extra: { ...f.extra, [key]: f.extra[key].filter((_, j) => j !== i) } }));
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
      const body = { headline: form.headline, about: form.about, accent: form.accent, repos: form.repos, links: form.links, notes: form.notes, published: publish ?? form.published, listed: !!form.listed, extra: form.extra };
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
                <div className="sel-row">
                  <span className="sel-n">{i + 1}</span>
                  <span className="sel-name">{n}{!byName[n] && <em> (not in list)</em>}</span>
                  <button
                    className={`ib ${hasNote(n) ? 'has' : ''} ${editing === n ? 'open' : ''}`}
                    onClick={() => setEditing(editing === n ? null : n)}
                    aria-expanded={editing === n}
                    aria-label={`Edit how ${n} appears`}
                    title="Write your own description"
                  >✎</button>
                  <button className="ib" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${n} up`}>↑</button>
                  <button className="ib" onClick={() => move(i, 1)} disabled={i === form.repos.length - 1} aria-label={`Move ${n} down`}>↓</button>
                  <button className="ib" onClick={() => { toggle(n); if (editing === n) setEditing(null); }} aria-label={`Remove ${n}`}>×</button>
                </div>
                {editing === n && (
                  <div className="sel-edit field">
                    <label className="lf">
                      <span>Your description <small>{(form.notes?.[n]?.blurb || '').length}/240</small></span>
                      <textarea
                        rows={3}
                        maxLength={240}
                        value={form.notes?.[n]?.blurb || ''}
                        onChange={(e) => setNote(n, { blurb: e.target.value })}
                        placeholder={byName[n]?.description || 'What it does and why it matters, in a sentence or two.'}
                      />
                    </label>
                    <label className="lf">
                      <span>Open this file first <small>optional</small></span>
                      <input
                        value={form.notes?.[n]?.file || ''}
                        maxLength={300}
                        onChange={(e) => setNote(n, { file: e.target.value })}
                        placeholder="src/index.js"
                        spellCheck={false}
                      />
                    </label>
                    <label className="lf">
                      <span>Screenshot link <small>optional, an image URL</small></span>
                      <input
                        value={form.notes?.[n]?.image || ''}
                        maxLength={200}
                        onChange={(e) => setNote(n, { image: e.target.value })}
                        placeholder="i.imgur.com/abc123.png"
                        spellCheck={false}
                      />
                    </label>
                    <div className="lf">
                      <span>Highlights <small>up to 3 short bullets</small></span>
                      {[0, 1, 2].map((k) => (
                        <input
                          key={k}
                          value={(form.notes?.[n]?.highlights || [])[k] || ''}
                          maxLength={100}
                          onChange={(e) => setHighlight(n, k, e.target.value)}
                          placeholder={['Handles 10k requests per second', 'Written in TypeScript with full tests', 'Used by 200+ people'][k]}
                        />
                      ))}
                    </div>
                    <p className="fine">Leave the description empty to use the one from GitHub. Without a file, visitors land on the README.</p>
                  </div>
                )}
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
          <fieldset className="field links-set">
            <legend>Contact and links</legend>
            <label className="lf">
              <span>Email</span>
              <input type="email" value={form.links.email} maxLength={120} onChange={(e) => setLink('email', e.target.value)} placeholder="you@example.com" autoComplete="off" />
            </label>
            <label className="lf">
              <span>Website</span>
              <input value={form.links.website} maxLength={200} onChange={(e) => setLink('website', e.target.value)} placeholder="yoursite.dev" autoComplete="off" spellCheck={false} />
            </label>
            <label className="lf">
              <span>LinkedIn</span>
              <input value={form.links.linkedin} maxLength={200} onChange={(e) => setLink('linkedin', e.target.value)} placeholder="linkedin.com/in/you" autoComplete="off" spellCheck={false} />
            </label>
            <label className="lf">
              <span>Résumé <small>link to a PDF</small></span>
              <input value={form.links.resume} maxLength={200} onChange={(e) => setLink('resume', e.target.value)} placeholder="yoursite.dev/resume.pdf" autoComplete="off" spellCheck={false} />
            </label>
            <p className="fine">Shown publicly on your portfolio, so only add what you want recruiters to see.</p>
          </fieldset>
          <details className="fold">
            <summary>Open to work badge {form.extra.open && <em className="fold-on">on</em>}</summary>
            <div className="field fold-body">
              <label className="check-row">
                <input type="checkbox" checked={!!form.extra.open} onChange={(e) => setExtra({ open: e.target.checked })} />
                <span>Show an “open to work” badge at the top of my page</span>
              </label>
              <label className="lf">
                <span>Badge text <small>{(form.extra.openText || '').length}/60</small></span>
                <input
                  value={form.extra.openText || ''}
                  maxLength={60}
                  onChange={(e) => setExtra({ openText: e.target.value })}
                  placeholder="Open to work · Remote · Full-time"
                />
              </label>
            </div>
          </details>

          <details className="fold">
            <summary>Featured project {form.extra.featured.repo && <em className="fold-on">set</em>}</summary>
            <div className="field fold-body">
              <label className="lf">
                <span>Which project</span>
                <select value={form.extra.featured.repo} onChange={(e) => setFeatured({ repo: e.target.value })}>
                  <option value="">None</option>
                  {form.repos.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="lf">
                <span>What you built and why <small>{(form.extra.featured.story || '').length}/500</small></span>
                <textarea rows={4} maxLength={500} value={form.extra.featured.story} onChange={(e) => setFeatured({ story: e.target.value })} placeholder="The problem, what you made, and what you are proud of." />
              </label>
              <label className="lf">
                <span>Screenshot link <small>optional</small></span>
                <input value={form.extra.featured.image} maxLength={200} onChange={(e) => setFeatured({ image: e.target.value })} placeholder="i.imgur.com/abc123.png" spellCheck={false} />
              </label>
              <label className="lf">
                <span>Live demo link <small>optional</small></span>
                <input value={form.extra.featured.demo} maxLength={200} onChange={(e) => setFeatured({ demo: e.target.value })} placeholder="myproject.dev" spellCheck={false} />
              </label>
              <p className="fine">Pick a project first, from the ones you selected on the left.</p>
            </div>
          </details>

          <details className="fold">
            <summary>Experience {form.extra.experience.length > 0 && <em className="fold-on">{form.extra.experience.length}</em>}</summary>
            <div className="field fold-body">
              {form.extra.experience.map((e, i) => (
                <div className="entry" key={i}>
                  <label className="lf"><span>Role</span><input value={e.role} maxLength={80} onChange={(ev) => setItem('experience', i, { role: ev.target.value })} placeholder="Backend Engineer" /></label>
                  <label className="lf"><span>Company</span><input value={e.org} maxLength={80} onChange={(ev) => setItem('experience', i, { org: ev.target.value })} placeholder="Acme Inc." /></label>
                  <label className="lf"><span>When</span><input value={e.period} maxLength={40} onChange={(ev) => setItem('experience', i, { period: ev.target.value })} placeholder="2022 – Present" /></label>
                  <label className="lf"><span>What you did <small>{e.desc.length}/300</small></span><textarea rows={3} maxLength={300} value={e.desc} onChange={(ev) => setItem('experience', i, { desc: ev.target.value })} /></label>
                  <button type="button" className="btn-mini" onClick={() => removeItem('experience', i)}>Remove this entry</button>
                </div>
              ))}
              <button type="button" className="btn-mini" disabled={form.extra.experience.length >= 6} onClick={() => addItem('experience', { role: '', org: '', period: '', desc: '' }, 6)}>+ Add experience</button>
            </div>
          </details>

          <details className="fold">
            <summary>Education {form.extra.education.length > 0 && <em className="fold-on">{form.extra.education.length}</em>}</summary>
            <div className="field fold-body">
              {form.extra.education.map((e, i) => (
                <div className="entry" key={i}>
                  <label className="lf"><span>School</span><input value={e.school} maxLength={100} onChange={(ev) => setItem('education', i, { school: ev.target.value })} placeholder="University of Example" /></label>
                  <label className="lf"><span>Degree or course</span><input value={e.degree} maxLength={100} onChange={(ev) => setItem('education', i, { degree: ev.target.value })} placeholder="B.Sc. Computer Science" /></label>
                  <label className="lf"><span>When</span><input value={e.period} maxLength={40} onChange={(ev) => setItem('education', i, { period: ev.target.value })} placeholder="2018 – 2022" /></label>
                  <button type="button" className="btn-mini" onClick={() => removeItem('education', i)}>Remove this entry</button>
                </div>
              ))}
              <button type="button" className="btn-mini" disabled={form.extra.education.length >= 4} onClick={() => addItem('education', { school: '', degree: '', period: '' }, 4)}>+ Add education</button>
            </div>
          </details>

          <label className="field check">
            <input type="checkbox" checked={!!form.listed} onChange={(e) => set({ listed: e.target.checked })} />
            <span>List me on the Explore page <small>Optional. Lets other people and search engines discover your portfolio.</small></span>
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