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
    if (systemLogs.length > 15) systemLogs.pop();
    console.log(`> ${msg}`);
}

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <title>BLOOMBERG MULTI-SMC TERMINAL</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { background-color: #020202; color: #00ff00; font-family: 'Courier New', monospace; }
            .b-orange { color: #ff8800; }
            .b-blue { color: #00e5ff; }
            .panel { border: 1px solid #1a1a1a; background: #080808; }
            .btn-bloomberg { border: 1px solid #333; background: #111; color: #00e5ff; font-size: 10px; padding: 4px 10px; cursor: pointer; }
            .btn-bloomberg:hover { background: #ff8800; color: #000; }
        </style>
    </head>
    <body class="p-4">
        <div class="flex justify-between border-b-2 border-orange-600 pb-1 mb-4">
            <h1 class="text-2xl font-black b-orange">BLOOMBERG SMC PROFESSIONAL</h1>
            <div class="text-right b-blue text-xs uppercase">
                <p>FEED: WELTRADE LIVE</p>
                <p id="clock">${new Date().toLocaleTimeString()}</p>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            ${Object.keys(markets).map(m => `
                <div class="panel p-3">
                    <div class="flex justify-between items-center border-b border-zinc-800 mb-2 font-bold text-[10px]">
                        <span class="b-blue">${m}</span>
                    </div>
                    <div class="text-4xl font-bold ${markets[m].color}">${markets[m].price || '0.00'}</div>
                </div>
            `).join('')}
        </div>
        <div class="panel p-1 mb-4">
            <div class="flex gap-2 p-2 border-b border-zinc-900">
                <button class="btn-bloomberg" onclick="document.getElementById('tv-iframe').src='https://s.tradingview.com/widgetembed/?symbol=WELTRADE%3APAIN400&theme=dark'">PAIN 400</button>
                <button class="btn-bloomberg" onclick="document.getElementById('tv-iframe').src='https://s.tradingview.com/widgetembed/?symbol=WELTRADE%3AGAIN400&theme=dark'">GAIN 400</button>
            </div>
            <iframe id="tv-iframe" src="https://s.tradingview.com/widgetembed/?symbol=WELTRADE%3APAIN400&theme=dark" width="100%" height="350px"></iframe>
        </div>
        <div class="panel p-3 h-32 overflow-hidden text-[10px] font-mono leading-tight">
            <div id="logs">${systemLogs.map(l => `<div>> ${l}</div>`).join('')}</div>
        </div>
        <script>setInterval(() => { location.reload(); }, 30000);</script>
    </body>
    </html>
    `);
});

async function startTerminal() {
    addLog("Lancement du moteur Puppeteer...");
    // CORRECTION : On ne met PLUS de executablePath ici
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const assets = [{ id: 'PAIN400', url: 'https://www.tradingview.com/chart/?symbol=WELTRADE:PAIN400' }];

    for (const asset of assets) {
        const page = await browser.newPage();
        try {
            await page.goto(asset.url, { waitUntil: 'networkidle2', timeout: 60000 });
            addLog(`Flux ${asset.id} OK.`);
            setInterval(async () => {
                const price = await page.evaluate(() => {
                    const el = document.querySelector('.last-K_uL78S-');
                    return el ? parseFloat(el.innerText.replace(',', '')) : null;
                });
                if (price) {
                    markets[asset.id].price = price;
                    runSMCLogic(asset.id, price);
                }
            }, 5000);
        } catch (e) { addLog("Erreur: " + e.message); }
    }
}

function runSMCLogic(id, price) {
    let m = markets[id];
    if (m.high === 0) { m.high = price + 10; m.low = price - 10; return; }
    if (price > m.high && m.status !== "SWEEP") {
        m.status = "SWEEP";
        addLog(`SWEEP SUR ${id}`);
    }
    if (m.status === "SWEEP" && price < m.high - 1.5) {
        bot.telegram.sendMessage(CHAT_ID, `🚨 SIGNAL ${id} : SELL à ${price}`);
        m.status = "SCANNING";
        m.high = price + 10;
    }
}

app.listen(PORT, () => {
    addLog(`Terminal Live Port ${PORT}`);
    startTerminal();
});
