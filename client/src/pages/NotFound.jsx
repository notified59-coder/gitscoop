import { Link } from 'react-router-dom';
import { Wordmark } from '../components/Brand.jsx';

export default function NotFound({ title = 'Nothing here', body = 'This page moved, or never existed.' }) {
  return (
    <main className="center-page">
      <Wordmark />
      <div className="big-code" aria-hidden="true">404</div>
      <h1>{title}</h1>
      <p className="muted">{body}</p>
      <Link className="btn btn-primary" to="/">Back to GitScoop</Link>
    </main>
  );
}