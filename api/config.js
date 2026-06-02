// Vercel serverless function: serves /config.js with the Mapbox token from the
// project's environment variables (set MAPBOX_TOKEN in the Vercel dashboard).
// This mirrors what serve.py does locally, so the static index.html can read
// window.ENV.MAPBOX_TOKEN in production.
module.exports = (req, res) => {
  const token = process.env.MAPBOX_TOKEN || '';
  const body = `window.ENV = ${JSON.stringify({ MAPBOX_TOKEN: token })};\n`;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(body);
};
