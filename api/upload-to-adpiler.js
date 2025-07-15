import { parse } from "csv-parse/sync";
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).send("Trello webhook verified");
  }

  try {
    const action = req.body?.action;
    const listName = action?.data?.listAfter?.name;
    const cardId = action?.data?.card?.id;

    console.log("📌 List moved to:", listName);
    console.log("🪪 Card ID:", cardId);

    if (action?.type === "updateCard" && listName === "Ready for AdPiler") {
      // Fetch full card data
      const cardRes = await fetch(
        `https://api.trello.com/1/cards/${cardId}?attachments=true&customFieldItems=true&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`
      );
      const card = await cardRes.json();

      console.log("📎 Full card response from Trello:", card);

      // Extract attachments
      const creativeUrls = (card.attachments || []).map(a => a.url);

      // Try to get client name from card name (e.g., "Zia Clovis: Something")
      const clientFromTitle = card.name?.split(":")[0]?.trim()?.toLowerCase();
      console.log("👤 Client from card title:", clientFromTitle);

      // Pull CSV from public Google Sheet
      const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRz1UmGBfYraNSQilE6KWPOKKYhtuTeNqlOhUgtO8PcYLs2w05zzdtb7ovWSB2EMFQ1oLP0eDslFhSq/pub?output=csv";
      const csv = await fetch(sheetUrl).then(res => res.text());
      const rows = parse(csv, { skip_empty_lines: true });

      const clientMap = {};
      rows.forEach(([name, id]) => {
        clientMap[name.trim().toLowerCase()] = id.trim();
      });

      const clientId = clientMap[clientFromTitle] || process.env.DEFAULT_CLIENT_ID;
      console.log("✅ Matched client ID:", clientId);

      // Upload to AdPiler
      const uploadRes = await fetch("https://platform.adpiler.com/api/preview-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_token: process.env.ADPILER_API_KEY,
          name: card.name,
          description: card.desc || "",
          creative_urls: creativeUrls,
          client_id: clientId
        })
      });

      const result = await uploadRes.json();
      console.log("📤 Upload response:", result);
    }

    res.status(200).send("Webhook received.");
  } catch (err) {
    console.error("❌ Upload handler error:", err);
    res.status(500).send("Server error.");
  }
}
