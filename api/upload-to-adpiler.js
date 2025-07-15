import fetch from 'node-fetch';
import { parse } from 'csv-parse/sync';

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).send('Trello webhook verified');

  const action = req.body?.action;
  const listName = action?.data?.listAfter?.name;
  const cardId = action?.data?.card?.id;

  if (action?.type === 'updateCard' && listName === 'Ready for AdPiler') {
    try {
      const cardRes = await fetch(
        \`https://api.trello.com/1/cards/\${cardId}?attachments=true&customFieldItems=true&key=\${process.env.TRELLO_KEY}&token=\${process.env.TRELLO_TOKEN}\`
      );
      const card = await cardRes.json();
      const creativeUrls = (card.attachments || []).map((a) => a.url);

      const title = card.name || '';
      const clientName = title.split(':')[0].trim().toLowerCase();

      const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRz1UmGBfYraNSQilE6KWPOKKYhtuTeNqlOhUgtO8PcYLs2w05zzdtb7ovWSB2EMFQ1oLP0eDslFhSq/pub?output=csv";
      const csvData = await fetch(sheetUrl).then((res) => res.text());
      const records = parse(csvData, { columns: false, skip_empty_lines: true });

      const clientMap = {};
      records.forEach(([name, id]) => {
        clientMap[name.trim().toLowerCase()] = id.trim();
      });

      let clientId = clientMap[clientName] || process.env.DEFAULT_CLIENT_ID;

      const uploadRes = await fetch("https://platform.adpiler.com/api/preview-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_token: process.env.ADPILER_API_KEY,
          name: card.name,
          description: card.desc,
          creative_urls: creativeUrls,
          client_id: clientId
        }),
      });

      const result = await uploadRes.json();
      console.log("✅ Upload successful:", result);
    } catch (err) {
      console.error("❌ Upload handler error:", err);
    }
  }

  res.status(200).send("Webhook received.");
}
