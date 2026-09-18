const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CONTEXT_PATH = '/CityBank/merchant';

const environments = {
  DEV: 'http://edge-payment-gateway.10.13.134.14.nip.io',
  UAT: 'https://k2.citybankplc.com/merchant-gateway',
  LOCAL: 'http://localhost:9083/merchant-gateway'
};

// Proxy endpoint for gettoken API (avoids CORS issues)
app.post('/api/gettoken', async (req, res) => {
  const { loginname, login_password, channel, env = 'DEV' } = req.body;

  if (!loginname || !login_password) {
    return res.status(400).json({
      status: 'error',
      message: 'loginname and login_password are required'
    });
  }

  const baseUrl = environments[env] || environments.DEV;
  const tokenUrl = `${baseUrl}${CONTEXT_PATH}/gettoken`;

  const headers = {
    'x-request-channel': channel || 'MOBILE',
    'Content-Type': 'application/json'
  };

  // Inject JSESSIONID specifically for LOCAL as requested
  if (env === 'LOCAL') {
    headers['Cookie'] = 'JSESSIONID=81C02F40AD1040FBBADC25156E655D38';
  }

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ loginname, login_password })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(`[${env}] Token API error:`, error.message);
    res.status(502).json({
      status: 'error',
      message: `Failed to reach CityBank API (${env}): ` + error.message
    });
  }
});

// =============================================================================
// MERCHANT CALLBACK — Citytouch POSTs payment result here after user pays
//
// Flow: User pays via Citytouch mobile/web
//       → Citytouch browser-POSTs form data to this endpoint (the merchant's resendpoint)
//       → We read the POST body and inject it into callback.html as a JS variable
//       → User sees the payment result on our merchant page
//
// POST body from CityBank gateway:
//   txnStatus=1 (1=success, 0=failed)
//   merchanRefNo=DEV
//   transactionId=NOV24-39220b63-5409-445d-8b51-016693cfb635
//   txnamount=23
// =============================================================================
app.post('/callback', express.urlencoded({ extended: true }), (req, res) => {
  const payload = req.body;                  // parsed form data from Citytouch
  const receivedAt = new Date().toISOString();

  console.log(`\n[CALLBACK] Payment result received at ${receivedAt}`);
  console.log('[CALLBACK] Payload:', payload);

  // Read the static callback.html and inject the payload as a JS variable
  // so the page can render immediately without a redirect
  const htmlPath = path.join(__dirname, 'public', 'callback.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Inject the server-received payload just before </head>
  const injection = `
  <script>
    // Payload injected server-side from CityBank POST callback
    window.__CALLBACK_PAYLOAD__ = ${JSON.stringify(payload)};
    window.__CALLBACK_RECEIVED_AT__ = ${JSON.stringify(receivedAt)};
    window.__CALLBACK_SOURCE__ = 'POST';
  </script>`;

  html = html.replace('</head>', injection + '\n</head>');
  res.send(html);
});

// GET /callback — for direct browser testing via URL query params
app.get('/callback', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'callback.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🏦 Merchant Payment Tester running at:`);
  console.log(`     http://localhost:${PORT}\n`);
});
