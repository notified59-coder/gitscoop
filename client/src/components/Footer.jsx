import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-in">
        <p className="footer-l">
          GitScoop is free, with no paywalls. Code and READMEs are fetched live from GitHub and cached for five minutes.
        </p>
        <p><Link to="/explore">Explore portfolios</Link></p>
      </div>
    </footer>
  );
}