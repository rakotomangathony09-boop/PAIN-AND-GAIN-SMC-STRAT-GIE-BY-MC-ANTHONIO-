const express = require('express');
const puppeteer = require('puppeteer');
const { Telegraf } = require('telegraf');
const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const PORT = process.env.PORT || 10000;

let markets = {
    'PAIN400': { price: 0, high: 0, low: 0, status: "SCANNING", color: "text-red-500" },
    'GAIN400': { price: 0, high: 0, low: 0, status: "SCANNING", color: "text-green-500" }
};
let systemLogs = [];

function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    systemLogs.unshift(`[${time}] ${msg}`);
    if (systemLogs.length > 10) systemLogs.pop();
    console.log(`> ${msg}`);
}

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <title>BLOOMBERG SMC TERMINAL</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { background-color: #020202; color: #00ff00; font-family: 'Courier New', monospace; }
            .b-orange { color: #ff8800; }
            .panel { border: 1px solid #1a1a1a; background: #080808; }
            .btn-b { border: 1px solid #333; background: #111; color: #00e5ff; padding: 5px 10px; cursor: pointer; font-size: 10px; }
        </style>
    </head>
    <body class="p-4">
        <div class="flex justify-between border-b-2 border-orange-600 pb-1 mb-4">
            <h1 class="text-xl font-black b-orange">BLOOMBERG SMC PRO - MC ANTHONIO</h1>
            <div class="text-right text-[10px] text-cyan-400 uppercase">FEED: WELTRADE LIVE</div>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
            ${Object.keys(markets).map(m => `
                <div class="panel p-3">
                    <div class="text-[10px] text-cyan-400 font-bold border-b border-zinc-800 mb-2">${m}</div>
                    <div class="text-3xl font-bold ${markets[m].color}">${markets[m].price || '0.00'}</div>
                </div>
            `).join('')}
        </div>
        <div class="panel p-1 mb-4">
            <div class="flex gap-2 p-2 border-b border-zinc-900">
                <button class="btn-b" onclick="document.getElementById('tv').src='https://s.tradingview.com/widgetembed/?symbol=WELTRADE%3APAIN400&theme=dark'">PAIN 400</button>
                <button class="btn-b" onclick="document.getElementById('tv').src='https://s.tradingview.com/widgetembed/?symbol=WELTRADE%3AGAIN400&theme=dark'">GAIN 400</button>
            </div>
            <iframe id="tv" src="https://s.tradingview.com/widgetembed/?symbol=WELTRADE%3APAIN400&theme=dark" width="100%" height="300px"></iframe>
        </div>
        <div class="panel p-2 h-32 overflow-hidden text-[9px] font-mono leading-tight">
            <div id="logs">${systemLogs.map(l => `<div>> ${l}</div>`).join('')}</div>
        </div>
        <script>setTimeout(() => { location.reload(); }, 15000);</script>
    </body>
    </html>
    `);
});

async function startTerminal() {
    addLog("Initialisation du navigateur...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const symbols = [
        { id: 'PAIN400', url: 'https://www.tradingview.com/chart/?symbol=WELTRADE:PAIN400' },
        { id: 'GAIN400', url: 'https://www.tradingview.com/chart/?symbol=WELTRADE:GAIN400' }
    ];

    for (const s of symbols) {
        const page = await browser.newPage();
        try {
            await page.goto(s.url, { waitUntil: 'networkidle2', timeout: 60000 });
            addLog(`Flux ${s.id} connecté.`);
            setInterval(async () => {
                const price = await page.evaluate(() => {
                    const el = document.querySelector('.last-K_uL78S-');
                    return el ? parseFloat(el.innerText.replace(',', '')) : null;
                });
                if (price) { markets[s.id].price = price; }
            }, 5000);
        } catch (e) { addLog("Erreur: " + s.id); }
    }
}

app.listen(PORT, () => {
    addLog(`Serveur actif sur port ${PORT}`);
    startTerminal();
});
