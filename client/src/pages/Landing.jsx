import { lazy, Suspense, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark, GithubIcon } from '../components/Brand.jsx';
import Footer from '../components/Footer.jsx';
import { useAuth } from '../auth.jsx';
import { siteHost } from '../util.js';

const Hero3D = lazy(() => import('../components/Hero3D.jsx'));

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

const STEPS = [
  { t: 'Sign in with GitHub', d: 'One click. We read your public profile and public repositories, nothing else.' },
  { t: 'Choose up to twelve', d: 'Pick the work you want seen first, then put it in the order you want it read.' },
  { t: 'Share the link', d: 'Put it in your résumé, bio or application. It is live the moment you publish.' },
];

const DEMO_FILES = {
  README: [
    ['# tinyqueue', 'h'], ['', ''],
    ['A fast, zero-dependency priority queue.', ''],
    ['', ''], ['- 1.4 KB gzipped', ''], ['- Works in Node, Deno and browsers', ''], ['- Fully typed', ''],
  ],
  'src/queue.ts': [
    ['export class Queue<T> {', ''], ['  private heap: T[] = [];', ''], ['', ''],
    ['  push(item: T) {', ''], ['    this.heap.push(item);', ''], ['    this.up(this.heap.length - 1);', ''], ['  }', ''], ['}', ''],
  ],
};

function Demo() {
  const [tab, setTab] = useState('README');
  const lines = DEMO_FILES[tab];
  return (
    <div className="demo-frame">
      <div className="demo-bar">
        <span className="demo-url">{siteHost()}/u/<b>ada</b>/tinyqueue</span>
      </div>
      <div className="demo-body">
        <div className="demo-tree" role="tablist" aria-label="Files">
          {Object.keys(DEMO_FILES).map((f) => (
            <button key={f} role="tab" aria-selected={tab === f} className={tab === f ? 'on' : ''} onClick={() => setTab(f)}>
              {f === 'README' ? 'README.md' : f}
            </button>
          ))}
          <span className="demo-hint">Try switching files</span>
        </div>
        <pre className="demo-code" aria-live="polite">
          {lines.map((l, i) => (
            <div key={`${tab}${i}`} className={l[1] === 'h' ? 'dl h' : 'dl'}><em>{i + 1}</em>{l[0] || ' '}</div>
          ))}
        </pre>
      </div>
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const [gl, setGl] = useState(false);
  useEffect(() => { setGl(hasWebGL()); document.title = 'GitScoop — your best repos, one link'; }, []);
  const cta = user ? (
    <Link className="btn btn-primary btn-lg" to="/dashboard">Open your dashboard</Link>
  ) : (
    <a className="btn btn-primary btn-lg" href="/api/auth/github"><GithubIcon size={18} /> Sign in with GitHub</a>
  );

  return (
    <div className="landing">
      <header className="top">
        <div className="wrap top-in">
          <Wordmark />
          <nav aria-label="Primary">
            <a href="#method">Method</a>
            <a href="#preview">Preview</a>
            <a href="#faq">Questions</a>
            {user
              ? <Link className="btn btn-sm" to="/dashboard">Dashboard</Link>
              : <a className="btn btn-sm" href="/api/auth/github">Sign in</a>}
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1>Stop making recruiters <em>dig</em> through GitHub.</h1>
            <p className="lede">
              Pick your best twelve repositories and get one link they can read from end to end: READMEs, folders and code, on a single page.
            </p>
            <div className="cta-row">
              {cta}
              <p className="claim" aria-label="Your link will look like this">
                {siteHost()}/u/<b className="caret">your-handle</b>
              </p>
            </div>
            <p className="meta-line">Free · Public repositories only · Unpublish any time</p>
          </div>

          <figure className="plate" aria-hidden="true">
            <div className="stage">
              {gl ? (
                <Suspense fallback={null}><div className="canvas-wrap"><Hero3D /></div></Suspense>
              ) : (
                <img className="plate-img" src="/brand/logo.svg" alt="" />
              )}
            </div>
            <figcaption className="plate-cap"><span>Fig. 1</span><span>The mark, rendered live</span></figcaption>
          </figure>
        </div>
      </section>

      <section id="method" className="sec">
        <div className="wrap sec-grid">
          <p className="sec-label"><b>01</b> Method</p>
          <div className="sec-body">
            <h2>From GitHub login to a shareable link in about a minute.</h2>
            <ol className="method">
              {STEPS.map((s, i) => (
                <li key={s.t}>
                  <span className="m-n">0{i + 1}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="preview" className="sec">
        <div className="wrap sec-grid">
          <p className="sec-label"><b>02</b> Preview</p>
          <div className="sec-body">
            <h2>The recruiter never has to leave the page.</h2>
            <div className="demo-grid">
              <div>
                <p className="lede sm">
                  Every project opens on its README, next to a browsable file tree. No cloning, no tab-hopping, no guessing which repository matters.
                </p>
                <ul className="ticks">
                  <li>Syntax-highlighted code with line numbers</li>
                  <li>Images and badges in READMEs render as they do on GitHub</li>
                  <li>Every file has its own link, so you can point at your best work</li>
                </ul>
              </div>
              <Demo />
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap sec-grid">
          <p className="sec-label"><b>03</b> Difference</p>
          <div className="sec-body">
            <h2>A profile README decorates. GitScoop shows the work.</h2>
            <div className="ledger-wrap">
              <table className="ledger">
                <thead>
                  <tr><th scope="col"><span className="sr">Aspect</span></th><th scope="col">Profile README</th><th scope="col" className="us">GitScoop</th></tr>
                </thead>
                <tbody>
                  <tr><th scope="row">What visitors get</th><td>Badges, and a link back out to GitHub</td><td>Your READMEs and code, read in place</td></tr>
                  <tr><th scope="row">Which projects</th><td>Up to six pinned repositories</td><td>The twelve you chose, in your order</td></tr>
                  <tr><th scope="row">Upkeep</th><td>Edit markdown by hand</td><td>Pick, order, publish</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="sec">
        <div className="wrap sec-grid">
          <p className="sec-label"><b>04</b> Questions</p>
          <div className="sec-body">
            <div className="faq-list">
              {[
                ['Is it free?', 'Yes. GitScoop is free while it grows, and your portfolio stays free.'],
                ['What can GitScoop see on my account?', 'Your public profile and public repositories. Private repositories are never listed or fetched.'],
                ['Can I take it down?', 'Switch your portfolio to draft and the link stops working immediately. Deleting your account removes your data.'],
                ['Do I need to redeploy when I push code?', 'No. Files are fetched live from GitHub and refreshed every five minutes.'],
              ].map(([q, a]) => (
                <details key={q}><summary>{q}</summary><p>{a}</p></details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="final">
        <div className="wrap final-in">
          <h2>Your repositories are already written. Let people <em>read</em> them.</h2>
          <div>{cta}</div>
        </div>
      </section>
      <Footer />
    </div>
  );
}