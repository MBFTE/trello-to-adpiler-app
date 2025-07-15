import { parse } from "csv-parse/sync";

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("Trello webhook verified");

  const action = req.body?.action;
  const listName = action?.data?.listAfter?.name;
  const cardId = action?.data?.card?.id;

  if (action?.type === "updateCard" && listName === "Ready for AdPiler") {
    try {
      const cardRes = await fetch(
        `https://api.trello.com/1/cards/${cardId}?attachments=true&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`
      );
      const card = await cardRes.json();

      const creativeUrls = (card.attachments || []).map(a => a.url);
      const title = card.name || "";
      const desc = card.desc || "";

      // Try to extract client name from card title (e.g., "Zia Clovis: ...")
      const clientName = title.split(":")[0]?.trim().toLowerCase();

      // Fetch Google Sheet CSV
      const csvUrl = process.env.CLIENT_SHEET_CSV;
      const csvData = await fetch(csvUrl).then(res => res.text());
      const records = parse(csvData, { columns: false, skip_empty_lines: true });

      const clientMap = {};
      records.forEach(([name, id]) => {
        clientMap[name.trim().toLowerCase()] = id.trim();
      });

      const clientId = clientMap[clientName] || process.env.DEFAULT_CLIENT_ID;

      const uploadRes = await fetch("https://platform.adpiler.com/api/preview-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_token: process.env.ADPILER_API_KEY,
          name: title,
          description: desc,
          creative_urls: creativeUrls,
          client_id: clientId,
        }),
      });

      const result = await uploadRes.json();
      console.log("✅ AdPiler result:", result);
    } catch (err) {
      console.error("❌ Upload error:", err);
    }
  }

  res.status(200).send("OK");
}
