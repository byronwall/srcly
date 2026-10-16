/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'
import App from './App.tsx'
import { loadMetricCatalog } from './utils/metricsStore'

const root = document.getElementById('root')

// Every metric surface reads the server's catalog, so it loads first.
loadMetricCatalog().then(
  () => render(() => <App />, root!),
  (error: unknown) => {
    const message = document.createElement('p')
    message.style.cssText = 'margin:2rem;font:14px system-ui;color:#b91c1c'
    message.textContent = `Srcly couldn't load its metric catalog from the server: ${error instanceof Error ? error.message : String(error)}`
    root!.replaceChildren(message)
  }
)
