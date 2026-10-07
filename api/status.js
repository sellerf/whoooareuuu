const targets = {
  main: 'https://linarcteam.site/',
  panel: 'https://manddy.site/',
  geo: 'https://societad.shop/geolocalize/',
  societad: 'https://societad.shop/'
};

async function check(url, inspectFrontend) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return false;
    if (inspectFrontend) {
      const html = await response.text();
      return !/A QUALQUER MOMENTO/i.test(html);
    }
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  response.setHeader('Cache-Control', 'no-store, max-age=0');
  const entries = await Promise.all(Object.entries(targets).map(async ([name, url]) => {
    return [name, await check(url, name === 'societad')];
  }));
  return response.status(200).json(Object.fromEntries(entries));
}