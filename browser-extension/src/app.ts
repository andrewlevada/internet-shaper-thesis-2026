import { ext, overlay } from 'fiber-extension';
import { html } from 'lit';

async function main() {
  console.log('Internet Shaper loaded');

  // Example: render an overlay
  overlay.render(html`
    <div style="position: fixed; bottom: 20px; right: 20px; padding: 12px 16px; background: #1a1a1a; color: white; border-radius: 8px; font-family: system-ui;">
      Internet Shaper
    </div>
  `);
}

main();
