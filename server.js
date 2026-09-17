const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const environments = {
  DEV: 'http://edge-payment-gateway.10.13.134.14.nip.io/CityBank/merchant',
  UAT: 'https://k2.citybankplc.com/merchant-gateway/CityBank/merchant',
  LOCAL: 'http://localhost:9083/merchant-gateway/CityBank/merchant'
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
  const tokenUrl = `${baseUrl}/gettoken`;

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

// Callback endpoint — CityBank gateway POSTs or GETs the result here
// Handle POST: convert form body to query string and redirect to GET /callback
app.post('/callback', express.urlencoded({ extended: true }), (req, res) => {
  const params = new URLSearchParams(req.body).toString();
  res.redirect(`/callback?${params}`);
});

// Handle GET: serve the callback result page (static file)
app.get('/callback', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'callback.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🏦 Merchant Payment Tester running at:`);
  console.log(`     http://localhost:${PORT}\n`);
});
