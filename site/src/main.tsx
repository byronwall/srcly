import { render } from 'solid-js/web';
import App from './App';
import './site.css';

const root = document.getElementById('root');
if (root) {
  root.replaceChildren();
  render(() => <App path={window.location.pathname} />, root);
}
