import { parse } from 'csv-parse/sync';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Trello webhook verified');
  }

  try {
    const action = req.body?.action;
    const listName = action?.data?.listAfter?.name;
    const cardId = action?.data?.card?.id;

    if (action?.type !== 'updateCard' || listName !== 'Ready for AdPiler') {
      return res.status(200).send('Ignored: Not a matching card move.');
    }

    console.log('📌 List moved to:', listName);
    console.log('🪪 Card ID:', cardId);

    const cardRes = await fetch(
      `https://api.trello.com/1/cards/${cardId}?attachments=true&customFieldItems=true&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`
    );
    const card = await cardRes.json();

    const creativeUrls = (card.attachments || []).map((a) => a.url);
    const cardName = card.name || '';
    const clientName = cardName.split(':')[0].trim().toLowerCase();

    console.log('👤 Client from card title:', clientName);

    const csvUrl = process.env.CLIENT_CSV_URL;
    const csvText = await fetch(csvUrl).then((res) => res.text());
    const rows = parse(csvText, { skip_empty_lines: true });

    const clientMap = {};
    rows.forEach(([name, id]) => {
      clientMap[name.trim().toLowerCase()] = id.trim();
    });

    const clientId = clientMap[clientName] || process.env.DEFAULT_CLIENT_ID;
    console.log('✅ Matched client ID:', clientId);

    const adpilerRes = await fetch('https://platform.adpiler.com/api/preview-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_token: process.env.ADPILER_API_KEY,
        name: card.name,
        description: card.desc,
        creative_urls: creativeUrls,
        client_id: clientId
      })
    });

    const adpilerJson = await adpilerRes.json();
    console.log('🎯 AdPiler response:', adpilerJson);

    return res.status(200).send('Upload completed.');
  } catch (err) {
    console.error('❌ Upload handler error:', err);
    return res.status(500).send('Internal server error');
  }
}
