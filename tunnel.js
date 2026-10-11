const { spawn } = require('child_process');
const path = require('path');

let cloudflaredProc = null;
let currentUrl = null;
let pingInterval = null;

function startTunnel() {
  const exePath = path.join(__dirname, 'cloudflared.exe');
  console.log('Iniciando Cloudflare Tunnel persistente con HTTP/2...');
  
  cloudflaredProc = spawn(exePath, ['tunnel', '--protocol', 'http2', '--url', 'http://localhost:3000'], {
    windowsHide: true
  });

  function handleData(data) {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !currentUrl) {
      currentUrl = match[0];
      console.log('==================================================');
      console.log('TUNNEL_ACTIVO: ' + currentUrl);
      console.log('==================================================');
      
      // Keepalive cada 20 segundos para evitar que Cloudflare cierre por inactividad
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(async () => {
        try {
          await fetch(currentUrl);
        } catch (e) {}
      }, 20000);
    }
  }

  cloudflaredProc.stdout.on('data', handleData);
  cloudflaredProc.stderr.on('data', handleData);

  cloudflaredProc.on('close', (code) => {
    console.log(`Cloudflared se cerró (código ${code}). Reiniciando en 3s...`);
    currentUrl = null;
    if (pingInterval) clearInterval(pingInterval);
    setTimeout(startTunnel, 3000);
  });
}

startTunnel();
