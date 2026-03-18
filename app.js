const express = require('express');
const puppeteer = require('puppeteer');
const { Telegraf } = require('telegraf');
const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const PORT = process.env.PORT || 10000;

let markets = {
    'PAIN400': { price: 0, high_sweep: 0, low_sweep: 0, max_session: 0, min_session: 0, status: "SCANNING", step: 0, active_trade: null },
    'GAIN400': { price: 0, high_sweep: 0, low_sweep: 0, max_session: 0, min_session: 0, status: "SCANNING", step: 0, active_trade: null }
};
let logs = [];

function addLog(msg) {
    const t = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Indian/Antananarivo' });
    logs.unshift("[" + t + "] " + msg);
    if (logs.length > 20) logs.pop();
}

app.get('/', (req, res) => {
    res.send(`
    <body style="background:#020202;color:#00ff00;font-family:monospace;padding:20px;text-align:center;">
        <h1 style="color:#ff8800;border-bottom:2px solid #ff8800;padding-bottom:10px;">VVIP TERMINAL DUO - MC ANTHONIO</h1>
        <div style="display:flex;gap:15px;margin:20px 0;justify-content:center;flex-wrap:wrap;">
            ${Object.keys(markets).map(sym => `
                <div style="flex:1;min-width:300px;border:2px solid #333;background:#0a0a0a;padding:20px;border-radius:10px;">
                    <div style="color:#00e5ff;">${sym} LIVE</div>
                    <div style="font-size:42px;font-weight:bold;color:#fff;">${markets[sym].price > 0 ? markets[sym].price.toFixed(2) : '---'}</div>
                    <div style="color:#ff8800;">${markets[sym].status}</div>
                </div>
            `).join('')}
        </div>
        <div style="background:#050505;border:1px solid #222;padding:15px;height:300px;overflow-y:auto;text-align:left;">
            ${logs.map(l => `<div style="color:#ccc;">> ${l}</div>`).join('')}
        </div>
        <script>setTimeout(()=>location.reload(), 10000);</script>
    </body>
    `);
});

async function startRobot() {
    addLog("Lancement du Système VVIP Mc Anthonio...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    for (const sym of ['PAIN400', 'GAIN400']) {
        try {
            await page.goto("https://www.tradingview.com/chart/?symbol=WELTRADE:" + sym, { waitUntil: 'domcontentloaded', timeout: 60000 });
            addLog("Connecté au flux : " + sym);
            
            setInterval(async () => {
                const priceText = await page.evaluate(() => {
                    const el = document.querySelector('.last-K_uL78S-');
                    return el ? el.innerText : null;
                });

                if (priceText) {
                    const price = parseFloat(priceText.replace(',', ''));
                    let m = markets[sym];
                    m.price = price;

                    if (m.max_session === 0) { 
                        m.max_session = price; m.min_session = price; 
                        m.high_sweep = price + 15; m.low_sweep = price - 15; 
                        return; 
                    }

                    // --- STRATÉGIE SMC ---
                    if (price > m.high_sweep && m.step === 0) { m.step = 1; m.status = "LIQUIDITY SWEEP (H)"; addLog(sym + ": Sweep Haut !"); }
                    if (m.step === 1 && price < m.high_sweep - 2.5) { m.step = 2; m.status = "BOS SELL CONFIRMED"; }
                    if (m.step === 2 && price >= m.high_sweep - 0.5) {
                        const sl = m.high_sweep + 2;
                        const tp1 = price - ((sl - price) * 3);
                        envoiSignal(sym, "SELL", price, sl, tp1, m.min_session);
                        m.active_trade = { type: "SELL", entry: price, tp1: tp1 };
                        resetMarket(m);
                    }

                    if (price < m.low_sweep && m.step === 0) { m.step = -1; m.status = "LIQUIDITY SWEEP (L)"; addLog(sym + ": Sweep Bas !"); }
                    if (m.step === -1 && price > m.low_sweep + 2.5) { m.step = -2; m.status = "BOS BUY CONFIRMED"; }
                    if (m.step === -2 && price <= m.low_sweep + 0.5) {
                        const sl = m.low_sweep - 2;
                        const tp1 = price + ((price - sl) * 3);
                        envoiSignal(sym, "BUY", price, sl, tp1, m.max_session);
                        m.active_trade = { type: "BUY", entry: price, tp1: tp1 };
                        resetMarket(m);
                    }
                }
            }, 10000);
            await new Promise(r => setTimeout(r, 5000));
        } catch (e) { addLog(`Erreur ${sym}.`); }
    }
}

function envoiSignal(sym, type, entry, sl, tp1, tpFinal) {
    const emoji = type === "BUY" ? "🔵" : "🔴";
    const msg = `🔥 **SIGNAL VVIP Mc ANTHONIO**\n📈 ACTIF : **${sym}**\n${emoji} ORDRE : **${type}**\n\n🎯 ENTRÉE : **${entry.toFixed(2)}**\n🛑 STOP : **${sl.toFixed(2)}**\n💰 TP1 : **${tp1.toFixed(2)}**\n🚀 TP FINAL : **${tpFinal.toFixed(2)}**`;
    bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
}

function resetMarket(m) {
    m.step = 0; m.status = "SCANNING";
    m.high_sweep = m.price + 15; m.low_sweep = m.price - 15;
}

app.listen(PORT, () => startRobot());
