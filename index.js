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
    const time = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Indian/Antananarivo' });
    systemLogs.unshift(`[${time}] ${msg}`);
    if (systemLogs.length > 12) systemLogs.pop();
    console.log(`> ${msg}`);
}

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <title>VVIP SIGNAL PRO - MC ANTHONIO</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { background-color: #020202; color: #00ff00; font-family: 'Courier New', monospace; overflow-x: hidden; }
            .b-orange { color: #ff8800; }
            .b-blue { color: #00e5ff; }
            .panel { border: 1px solid #1a1a1a; background: #080808; }
            .btn-bloomberg { border: 1px solid #333; background: #111; color: #00e5ff; font-size: 11px; padding: 6px 12px; cursor: pointer; font-weight: bold; transition: 0.3s; }
            .btn-bloomberg:hover { background: #ff8800; color: #000; border-color: #ff8800; }
            .blink { animation: opacity 1.2s infinite; }
            @keyframes opacity { 50% { opacity: 0.3; } }
        </style>
    </head>
    <body class="p-4">
        <div class="flex justify-between border-b-2 border-orange-600 pb-2 mb-4">
            <h1 class="text-2xl font-black b-orange">VVIP SIGNAL PRO - MC ANTHONIO</h1>
            <div class="text-right b-blue text-xs uppercase font-sans">
                <p>FEED: WELTRADE LIVE (EAT)</p>
                <p id="clock">${new Date().toLocaleTimeString('fr-FR', { timeZone: 'Indian/Antananarivo' })}</p>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            ${Object.keys(markets).map(m => `
                <div class="panel p-3">
                    <div class="flex justify-between items-center border-b border-zinc-800 mb-2 font-bold text-xs">
                        <span class="b-blue">${m}</span>
                        <span class="text-zinc-500 italic">SMC ALGORITHM v2.0</span>
                    </div>
                    <div class="text-4xl font-bold ${markets[m].color}">${markets[m].price || 'LOADING...'}</div>
                    <div class="mt-2 text-[10px] uppercase">
                        STATUS: <span class="text-white blink">${markets[m].status}</span><br>
                        <span class="text-zinc-400">LIQ HIGH: ${markets[m].high} | LIQ LOW: ${markets[m].low}</span>
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="panel p-1 mb-4">
            <div class="flex gap-2 p-2 border-b border-zinc-900 bg-black">
                <button class="btn-bloomberg" onclick="changeChart('PAIN400')">VIEW PAIN 400 LIVE</button>
                <button class="btn-bloomberg" onclick="changeChart('GAIN400')">VIEW GAIN 400 LIVE</button>
            </div>
            <div id="chart-container" style="height: 400px; background: #000;">
                <iframe id="tv-iframe" src="https://s.tradingview.com/widgetembed/?symbol=WELTRADE%3APAIN400&interval=5&theme=dark&style=1&locale=fr" width="100%" height="400px" style="border:none;"></iframe>
            </div>
        </div>

        <div class="panel p-3 h-48 overflow-hidden text-[10px] font-mono leading-tight">
            <h2 class="b-orange underline mb-2 uppercase text-[11px]">System Activity Logs</h2>
            <div id="logs">${systemLogs.map(l => `<div class="border-b border-zinc-900 pb-1">> ${l}</div>`).join('')}</div>
        </div>

        <script>
            function changeChart(asset) {
                document.getElementById('tv-iframe').src = "https://s.tradingview.com/widgetembed/?symbol=WELTRADE%3A" + asset + "&interval=5&theme=dark&style=1&locale=fr";
            }
            // Actualisation automatique des prix
            setInterval(() => { location.reload(); }, 20000);
        </script>
    </body>
    </html>
    `);
});

// LOGIQUE SMC ET PUPPETEER
async function startTerminal() {
    addLog("Initialisation du système autonome...");
    
    // Configuration optimisée pour Render (sans forcer de chemin)
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--single-process'
        ]
    });

    const assets = [
        { id: 'PAIN400', url: 'https://www.tradingview.com/chart/?symbol=WELTRADE:PAIN400' },
        { id: 'GAIN400', url: 'https://www.tradingview.com/chart/?symbol=WELTRADE:GAIN400' }
    ];

    for (const asset of assets) {
        const page = await browser.newPage();
        try {
            await page.goto(asset.url, { waitUntil: 'networkidle2', timeout: 60000 });
            addLog(`✅ Flux ${asset.id} synchronisé.`);
            
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
                } catch (e) {}
            }, 5000);
        } catch (err) {
            addLog(`❌ Erreur ${asset.id}: ${err.message}`);
        }
    }
}

function runSMCLogic(id, price) {
    let m = markets[id];
    
    // Initialisation des niveaux
    if (m.high === 0) { 
        m.high = price + 10.5; 
        m.low = price - 10.5; 
        return; 
    }

    // Détection SWEEP
    if (price > m.high && m.status !== "SWEEP_DETECTED") {
        m.status = "SWEEP_DETECTED";
        addLog(`⚠️ [${id}] LIQUIDITY SWEEP DÉTECTÉ À ${price}`);
    }

    // Confirmation BOS et Signal
    if (m.status === "SWEEP_DETECTED" && price < m.high - 1.8) {
        m.status = "BOS_CONFIRMED";
        sendTelegram(id, "SELL", price);
        addLog(`🎯 [${id}] BOS VALIDÉ. SIGNAL ENVOYÉ SUR TELEGRAM.`);
        m.status = "SCANNING";
        m.high = price + 12; // Reset
    }
}

async function sendTelegram(pair, type, price) {
    const msg = `📡 **VVIP SIGNAL PRO : ${pair}**\n━━━━━━━━━━━━━━━━━━\n⚡ **SIGNAL :** ${type} 🔴\n🎯 **PRIX D'ENTRÉE :** ${price}\n📊 **CONFIRMATION :** Sweep + BOS M5\n━━━━━━━━━━━━━━━━━━\n✅ *Mc Anthonio - Autonomous Trading System*`;
    bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' }).catch(e => console.log("Telegram Error"));
}

app.listen(PORT, () => {
    addLog(`VVIP Terminal démarré sur le port ${PORT}`);
    startTerminal();
});
