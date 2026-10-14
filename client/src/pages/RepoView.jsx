import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { ACCENTS, langColor, fmt } from '../util.js';
import Markdown from '../components/Markdown.jsx';
import CodeView from '../components/CodeView.jsx';
import NotFound from './NotFound.jsx';
import ThemeToggle, { useTheme } from '../components/ThemeToggle.jsx';

function TreeNode({ base, item, depth, activePath, onOpen }) {
  const [open, setOpen] = useState(false);
  const [kids, setKids] = useState(null);
  const [busy, setBusy] = useState(false);
  const isDir = item.type === 'dir';

  const toggle = async () => {
    if (!isDir) return onOpen(item.path);
    setOpen(!open);
    if (!kids && !open) {
      setBusy(true);
      try {
        setKids((await api(`${base}/tree?path=${encodeURIComponent(item.path)}`)).items);
      } catch {
        setKids([]);
      }
      setBusy(false);
    }
  };

  return (
    <li>
      <button
        className={`node ${activePath === item.path ? 'on' : ''}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={toggle}
        aria-expanded={isDir ? open : undefined}
      >
        <span className="ico" aria-hidden="true">{isDir ? (open ? '▾' : '▸') : '·'}</span>
        <span className="nm">{item.name}</span>
        {busy && <span className="spin" aria-label="Loading" />}
      </button>
      {open && kids && (
        <ul>
          {kids.map((k) => (
            <TreeNode key={k.path} base={base} item={k} depth={depth + 1} activePath={activePath} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function RepoView() {
  const { username, repo } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [theme, setTheme] = useTheme();
  const [pf, setPf] = useState(null);
  const [err, setErr] = useState(null);
  const [readme, setReadme] = useState(undefined);
  const [root, setRoot] = useState([]);
  const [file, setFile] = useState(null);
  const [fileErr, setFileErr] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const base = `/p/${username}/${repo}`;
  const filePath = sp.get('file');

  useEffect(() => {
    api(`/p/${username}`).then(setPf).catch(setErr);
    api(`${base}/readme`).then(setReadme).catch((e) => { if (e.status === 404) setErr(e); else setReadme(null); });
    api(`${base}/tree`).then((d) => setRoot(d.items)).catch(() => setRoot([]));
  }, [username, repo]);

  useEffect(() => {
    setFile(null);
    setFileErr(null);
    if (!filePath) return;
    api(`${base}/file?path=${encodeURIComponent(filePath)}`).then(setFile).catch((e) => setFileErr(e.message));
  }, [filePath, base]);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !e.target.closest('input,textarea')) nav(`/u/${username}`); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [nav, username]);

  useEffect(() => {
    if (!pf) return;
    document.title = `${repo} — ${pf.user.name || pf.user.username}`;
  }, [pf, repo]);

  const open = useCallback((p) => { setSp({ file: p }, { replace: false }); setNavOpen(false); }, [setSp]);
  const showReadme = () => setSp({}, { replace: false });

  if (err) return <NotFound title="Project not found" body="This project isn’t part of the portfolio, or the portfolio is unpublished." />;
  if (!pf) return <div className="boot" role="status"><span className="loader" /></div>;

  const r = pf.repos.find((x) => x.name === repo);
  if (!r) return <NotFound title="Project not found" body="This project isn’t part of the portfolio." />;
  const gh = `https://github.com/${r.full_name}`;

  return (
    <div className="pf rv" data-theme={theme} style={{ '--accent': ACCENTS[pf.portfolio.accent] || ACCENTS.red }}>
      <div className="pf-top">
        <div className="wrap pf-top-in">
          <Link className="back" to={`/u/${username}`}>← {pf.user.name || username}’s projects</Link>
          <div className="pf-top-r">
            <a className="btn-mini" href={gh} target="_blank" rel="noopener noreferrer">GitHub</a>
            {r.homepage && <a className="btn-mini" href={r.homepage} target="_blank" rel="noopener noreferrer">Live site</a>}
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>
      </div>

      <header className="rv-head wrap">
        <h1>{r.name}</h1>
        {(r.blurb || r.description) && <p className="pf-headline">{r.blurb || r.description}</p>}
        <div className="proj-meta">
          {r.language && <span><i style={{ background: langColor(r.language) }} />{r.language}</span>}
          <span>★ {fmt(r.stars)}</span>
          <span>⑂ {fmt(r.forks)}</span>
          {r.topics.slice(0, 4).map((t) => <span key={t} className="tagx">{t}</span>)}
          <span className="grow fine">Press <kbd className="kbd">Esc</kbd> to go back</span>
        </div>
      </header>

      <div className="rv-body wrap">
        <button className="btn-mini tree-toggle" onClick={() => setNavOpen(!navOpen)} aria-expanded={navOpen}>Files</button>
        <aside className={`tree ${navOpen ? 'open' : ''}`} aria-label="Files">
          <button className={`node readme-node ${!filePath ? 'on' : ''}`} onClick={showReadme}>
            <span className="ico">¶</span><span className="nm">README</span>
          </button>
          <ul>
            {root.map((i) => (
              <TreeNode key={i.path} base={base} item={i} depth={0} activePath={filePath} onOpen={open} />
            ))}
          </ul>
        </aside>

        <section className="viewer" aria-live="polite">
          {filePath ? (
            fileErr ? <div className="empty"><p>{fileErr}</p></div>
              : !file ? <div className="skeleton" />
              : <CodeView file={file} githubUrl={`${gh}/blob/${r.default_branch}/${filePath}`} />
          ) : readme === undefined ? (
            <div className="skeleton" />
          ) : readme?.markdown ? (
            <article className="readme"><Markdown text={readme.markdown} repo={r} /></article>
          ) : (
            <div className="empty"><p>This project has no README. Pick a file on the left to read the code.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}