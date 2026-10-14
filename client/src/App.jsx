import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import NotFound from './pages/NotFound.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Portfolio = lazy(() => import('./pages/Portfolio.jsx'));
const RepoView = lazy(() => import('./pages/RepoView.jsx'));

const Loading = () => (
  <div className="boot" role="status" aria-label="Loading">
    <span className="loader" />
  </div>
);

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/u/:username" element={<Portfolio />} />
          <Route path="/u/:username/:repo" element={<RepoView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}