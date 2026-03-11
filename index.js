const express = require('express');
const puppeteer = require('puppeteer');
const { Telegraf } = require('telegraf');
const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const PORT = process.env.PORT || 10000;

// MÉMOIRE MULTI-ASSETS (PAIN & GAIN)
let markets = {
    'PAIN400': { price: 0, high: 0, low: 0, status: "INITIALIZING", lastSignal: "NONE", color: "text-red-500" },
    'GAIN400': { price: 0, high: 0, low: 0, status: "INITIALIZING", lastSignal: "NONE", color: "text-green-500" }
};
let systemLogs = [];

function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    systemLogs.unshift(`[${time}] ${msg}`);
    if (systemLogs.length > 20) systemLogs.pop();
}

// INTERFACE BLOOMBERG MULTI-ASSETS
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
            .blink { animation: opacity 1s infinite; }
            @keyframes opacity { 50% { opacity: 0.3; } }
        </style>
    </head>
    <body class="p-4">
        <div class="flex justify-between border-b-2 border-orange-600 pb-1 mb-4">
            <h1 class="text-2xl font-black b-orange">BLOOMBERG SMC PROFESSIONAL</h1>
            <div class="text-right b-blue text-xs font-sans uppercase">
                <p>FEED: WELTRADE LIVE</p>
                <p>${new Date().toLocaleDateString()} | <span id="clock">${new Date().toLocaleTimeString()}</span></p>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            ${Object.keys(markets).map(m => `
                <div class="panel p-3">
                    <div class="flex justify-between items-center border-b border-zinc-800 mb-2">
                        <span class="b-blue font-bold">${m}</span>
                        <span class="text-[10px] text-zinc-500 uppercase">SMC M5-M20</span>
                    </div>
                    <div class="text-4xl font-bold ${markets[m].color}">${markets[m].price || 'LOADING...'}</div>
                    <div class="mt-2 text-[11px] uppercase tracking-tighter">
                        STATUS: <span class="text-white blink">${markets[m].status}</span><br>
                        <span class="text-zinc-500 text-[10px]">H: ${markets[m].high} | L: ${markets[m].low}</span>
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="panel p-3 h-80 overflow-hidden">
            <h2 class="b-orange underline text-[10px] mb-2 uppercase">Global Activity Logs</h2>
            <div class="space-y-1 text-[10px] font-mono leading-tight">
                ${systemLogs.map(l => `<div class="border-b border-zinc-900 pb-1">> ${l}</div>`).join('')}
            </div>
        </div>

        <script>setTimeout(() => { location.reload(); }, 5000);</script>
    </body>
    </html>
    `);
});

// ANALYSEUR PUPPETEER MULTI-ONGLETS
async function startTerminal() {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    addLog("Initialisation du moteur de scraping...");

    const assets = [
        { id: 'PAIN400', url: 'https://www.tradingview.com/chart/?symbol=WELTRADE:PAIN400' },
        { id: 'GAIN400', url: 'https://www.tradingview.com/chart/?symbol=WELTRADE:GAIN400' }
    ];

    for (const asset of assets) {
        const page = await browser.newPage();
        await page.goto(asset.url, { waitUntil: 'networkidle2', timeout: 60000 });
        addLog(`Flux ${asset.id} synchronisé.`);

        setInterval(async () => {
            try {
                const price = await page.evaluate(() => {
                    const el = document.querySelector('.last-K_uL78S-');
                    return el ? parseFloat(el.innerText.replace(',', '')) : null;
                });

                if (price) {
                    markets[asset.id].price = price;
                    runSMCLogic(asset.id, price);
                }
            } catch (e) { console.error(`Erreur ${asset.id}:`, e.message); }
        }, 5000);
    }
}

function runSMCLogic(id, price) {
    let m = markets[id];
    if (m.high === 0) { 
        m.high = price + 10; m.low = price - 10; 
        m.status = "SCANNING"; return; 
    }

    // SWEEP DETECTION
    if (price > m.high && m.status !== "SWEEP_DETECTED") {
        m.status = "SWEEP_DETECTED";
        addLog(`ALERTE : ${id} - LIQUIDITY SWEEP À ${price}`);
    }

    // BOS DETECTION (Confirmation)
    if (m.status === "SWEEP_DETECTED" && price < m.high - 1.5) {
        m.status = "BOS_CONFIRMED";
        sendTelegram(id, "SELL", price);
        addLog(`SIGNAL : ${id} - BOS VALIDÉ À ${price}`);
        m.status = "SCANNING";
        m.high = price + 12; // Update structure
    }
}

async function sendTelegram(pair, type, price) {
    const icon = type === 'SELL' ? '🔴' : '🟢';
    const msg = `📡 **TERMINAL BLOOMBERG : ${pair}**\n━━━━━━━━━━━━━━━━━━\n⚡ **SIGNAL :** ${type} ${icon}\n💰 **PRIX :** ${price}\n📊 **STRATÉGIE :** Sweep + BOS Confirmed\n━━━━━━━━━━━━━━━━━━\n✅ *Exécution Autonome sur Render*`;
    bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
}

app.listen(PORT, () => {
    console.log(`Bloomberg Terminal Live sur Port ${PORT}`);
    startTerminal();
});
