const express = require('express');
const puppeteer = require('puppeteer');
const { Telegraf } = require('telegraf');
const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const PORT = process.env.PORT || 10000;

let markets = {
    'PAIN400': { price: 0, high_sweep: 0, low_sweep: 0, max_session: 0, min_session: 0, status: "INITIALISATION", step: 0, active_trade: null },
    'GAIN400': { price: 0, high_sweep: 0, low_sweep: 0, max_session: 0, min_session: 0, status: "INITIALISATION", step: 0, active_trade: null }
};
let logs = [];

function addLog(msg) {
    const t = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Indian/Antananarivo' });
    logs.unshift(`[${t}] ${msg}`);
    if (logs.length > 10) logs.pop();
}

app.get('/', (req, res) => {
    res.send(`
    <body style="background:#020202;color:#00ff00;font-family:monospace;padding:20px;margin:0;text-align:center;">
        <h1 style="color:#ff8800;border-bottom:2px solid #ff8800;padding-bottom:10px;">VVIP TERMINAL DUO - MC ANTHONIO</h1>
        <div style="display:flex;gap:15px;margin:20px 0;justify-content:center;">
            ${Object.keys(markets).map(sym => `
                <div style="flex:1;max-width:350px;border:2px solid #333;background:#0a0a0a;padding:20px;border-radius:10px;">
                    <div style="color:#00e5ff;font-size:14px;font-weight:bold;">${sym} LIVE</div>
                    <div style="font-size:42px;font-weight:bold;color:#fff;margin:15px 0;">${markets[sym].price > 0 ? markets[sym].price.toFixed(2) : 'CHARGEMENT...'}</div>
                    <div style="font-size:12px;color:#ff8800;background:#111;padding:5px;">${markets[sym].status}</div>
                </div>
            `).join('')}
        </div>
        <div style="background:#050505;border:1px solid #222;padding:15px;height:250px;overflow-y:auto;text-align:left;border-radius:5px;">
            <div style="color:#ff8800;font-weight:bold;margin-bottom:10px;">FLUX SMC & SÉCURITÉ :</div>
            ${logs.map(l => `<div style="border-left:2px solid #333;padding-left:10px;margin-bottom:5px;font-size:13px;color:#ccc;">> ${l}</div>`).join('')}
        </div>
        <script>setTimeout(()=>location.reload(), 8000);</script>
    </body>
    `);
});

async function startRobot() {
    addLog("Lancement du Système Duo VVIP...");
    try {
        const browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
        });
        const page = await browser.newPage();
        
        for (const sym of ['PAIN400', 'GAIN400']) {
            await page.goto(`https://www.tradingview.com/chart/?symbol=WELTRADE:${sym}`, { waitUntil: 'domcontentloaded' });
            addLog(`Flux ${sym} Connecté.`);
            
            setInterval(async () => {
                try {
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
                            m.high_sweep = price + 10; m.low_sweep = price - 10; 
                            return; 
                        }

                        // GESTION BREAK EVEN
                        if (m.active_trade) {
                            const { type, entry, tp1 } = m.active_trade;
                            if ((type === "SELL" && price <= tp1) || (type === "BUY" && price >= tp1)) {
                                bot.telegram.sendMessage(CHAT_ID, `🛡️ **BE ALERTE - ${sym}**\nTP1 atteint ! Sécurisez au prix d'entrée : **${entry.toFixed(2)}**`);
                                addLog(`${sym}: TP1 atteint. Alerte BE envoyée.`);
                                m.active_trade = null;
                            }
                        }

                        // LOGIQUE VENTE (SELL)
                        if (price > m.high_sweep && m.step === 0) { m.step = 1; m.status = "LIQUIDITY SWEEP (H)"; addLog(`${sym}: Sweep détecté !`); }
                        if (m.step === 1 && price < m.high_sweep - 3) { m.step = 2; m.status = "BOS SELL CONFIRMED"; }
                        if (m.step === 2 && price >= m.high_sweep - 0.5) {
                            const sl = m.high_sweep + 2;
                            const tp1 = price - ((sl - price) * 3);
                            envoiSignal(sym, "SELL", price, sl, tp1, m.min_session);
                            m.active_trade = { type: "SELL", entry: price, tp1: tp1 };
                            resetMarket(m);
                        }

                        // LOGIQUE ACHAT (BUY)
                        if (price < m.low_sweep && m.step === 0) { m.step = -1; m.status = "LIQUIDITY SWEEP (B)"; addLog(`${sym}: Sweep détecté !`); }
                        if (m.step === -1 && price > m.low_sweep + 3) { m.step = -2; m.status = "BOS BUY CONFIRMED"; }
                        if (m.step === -2 && price <= m.low_sweep + 0.5) {
                            const sl = m.low_sweep - 2;
                            const tp1 = price + ((price - sl) * 3);
                            envoiSignal(sym, "BUY", price, sl, tp1, m.max_session);
                            m.active_trade = { type: "BUY", entry: price, tp1: tp1 };
                            resetMarket(m);
                        }

                        if (price > m.max_session) m.max_session = price;
                        if (price < m.min_session) m.min_session = price;
                    }
                } catch (e) {}
            }, 7000);
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) { addLog("Erreur Critique. Relancez le build."); }
}

function envoiSignal(sym, type, entry, sl, tp1, tpFinal) {
    const emoji = type === "BUY" ? "🔵" : "🔴";
    const msg = `🔥 **VVIP SIGNAL Mc ANTHONIO**\n\n📈 ACTIF : **${sym}**\n${emoji} ORDRE : **${type}**\n\n🎯 ENTRÉE : **${entry.toFixed(2)}**\n🛑 STOP : **${sl.toFixed(2)}**\n\n💰 TP1 (RR 3) : **${tp1.toFixed(2)}**\n🚀 TP FINAL : **${tpFinal.toFixed(2)}**`;
    bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
    addLog(`SIGNAL ${type} ${sym} ENVOYÉ`);
}

function resetMarket(m) {
    m.step = 0; m.status = "SCANNING";
    m.high_sweep = m.price + 10; m.low_sweep = m.price - 10;
}

app.listen(PORT, () => startRobot());
