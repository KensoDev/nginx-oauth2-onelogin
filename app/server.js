const express = require('express');
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  const userEmail = req.headers['x-forwarded-email'] || 'Not authenticated';
  const userName = req.headers['x-forwarded-user'] || 'Unknown';
  const groups = req.headers['x-forwarded-groups'] || 'None';

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>OAuth2 Protected App</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 {
            color: #333;
          }
          .info {
            background: #e8f4f8;
            padding: 15px;
            border-radius: 4px;
            margin: 10px 0;
          }
          .label {
            font-weight: bold;
            color: #555;
          }
          .value {
            color: #222;
            margin-left: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎉 Authentication Successful!</h1>
          <p>You have successfully authenticated via OAuth2/OIDC.</p>

          <div class="info">
            <div><span class="label">Email:</span><span class="value">${userEmail}</span></div>
            <div><span class="label">User:</span><span class="value">${userName}</span></div>
            <div><span class="label">Groups:</span><span class="value">${groups}</span></div>
          </div>

          <h2>Request Headers</h2>
          <pre style="background: #f8f8f8; padding: 15px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(req.headers, null, 2)}</pre>
        </div>
      </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});
