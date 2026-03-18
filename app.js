const express = require('express');
const puppeteer = require('puppeteer');
const { Telegraf } = require('telegraf');
const app = express();

// --- CONFIGURATION SÉCURISÉE ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const PORT = process.env.PORT || 10000;

// État des marchés en temps réel
let markets = {
    'PAIN400': { price: 0, high_sweep: 0, low_sweep: 0, max_session: 0, min_session: 0, status: "INITIALISATION", step: 0, active_trade: null },
    'GAIN400': { price: 0, high_sweep: 0, low_sweep: 0, max_session: 0, min_session: 0, status: "INITIALISATION", step: 0, active_trade: null }
};
let logs = [];

function addLog(msg) {
    const t = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Indian/Antananarivo' });
    logs.unshift("[" + t + "] " + msg);
    if (logs.length > 20) logs.pop();
    console.log(`[LOG] ${msg}`);
}

// --- INTERFACE DU TERMINAL ---
app.get('/', (req, res) => {
    res.send(`
    <body style="background:#020202;color:#00e5ff;font-family:'Courier New',monospace;padding:20px;margin:0;">
        <div style="max-width:900px;margin:auto;">
            <h1 style="color:#ff8800;border-bottom:2px solid #ff8800;text-align:center;padding-bottom:10px;">VVIP TERMINAL DUO - MC ANTHONIO</h1>
            <p style="text-align:center;color:#ccc;">SYSTÈME AUTOMATISÉ SMC v1.0 | PROPRIÉTÉ EXCLUSIVE</p>
            
            <div style="display:flex;gap:20px;margin:30px 0;justify-content:center;flex-wrap:wrap;">
                ${Object.keys(markets).map(sym => `
                    <div style="flex:1;min-width:300px;border:1px solid #333;background:#0a0a0a;padding:25px;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.5);">
                        <div style="color:#888;font-size:12px;text-transform:uppercase;">Actif</div>
                        <div style="font-size:24px;font-weight:bold;color:#ff8800;">${sym}</div>
                        <div style="font-size:48px;font-weight:bold;color:#fff;margin:15px 0;">${markets[sym].price > 0 ? markets[sym].price.toFixed(2) : '---'}</div>
                        <div style="font-size:14px;background:#1a1a1a;padding:8px;border-radius:4px;color:${markets[sym].step !== 0 ? '#00ff00' : '#ff8800'}">
                            STATUT : ${markets[sym].status}
                        </div>
                    </div>
                `).join('')}
            </div>

            <div style="background:#050505;border:1px solid #222;padding:20px;border-radius:8px;">
                <div style="color:#ff8800;font-weight:bold;margin-bottom:15px;display:flex;justify-content:space-between;">
                    <span>FLUX DE SÉCURITÉ & SIGNAUX</span>
                    <span style="color:#444;">ANTANANARIVO TIME</span>
                </div>
                <div style="height:350px;overflow-y:auto;font-size:13px;line-height:1.6;">
                    ${logs.map(l => `<div style="border-bottom:1px solid #111;padding:5px 0;color:#00ccff;">${l}</div>`).join('')}
                </div>
            </div>
        </div>
        <script>setTimeout(()=>location.reload(), 10000);</script>
    </body>
    `);
});

// --- LOGIQUE DE TRADING SMC ---
async function startRobot() {
    addLog("Initialisation du moteur Puppeteer...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    for (const sym of ['PAIN400', 'GAIN400']) {
        try {
            await page.goto("https://www.tradingview.com/chart/?symbol=WELTRADE:" + sym, { waitUntil: 'networkidle2', timeout: 90000 });
            addLog(`Flux stable établi : ${sym}`);

            setInterval(async () => {
                const priceText = await page.evaluate(() => {
                    const el = document.querySelector('.last-K_uL78S-');
                    return el ? el.innerText : null;
                });

                if (priceText) {
                    const price = parseFloat(priceText.replace(',', ''));
                    let m = markets[sym];
                    m.price = price;

                    // Initialisation des zones de Liquidité
                    if (m.max_session === 0) {
                        m.max_session = price; m.min_session = price;
                        m.high_sweep = price + 15; m.low_sweep = price - 15;
                        m.status = "SCANNING RANGE";
                        return;
                    }

                    // 🛡️ GESTION DU BREAK-EVEN (SÉCURITÉ)
                    if (m.active_trade) {
                        const { type, entry, tp1 } = m.active_trade;
                        if ((type === "SELL" && price <= tp1) || (type === "BUY" && price >= tp1)) {
                            bot.telegram.sendMessage(CHAT_ID, `🛡️ **BE - ${sym}**\nTP1 atteint ! Sécurisez l'entrée à **${entry.toFixed(2)}**`, { parse_mode: 'Markdown' });
                            m.active_trade = null; // Trade sécurisé
                        }
                    }

                    // 🔴 LOGIQUE SMC : VENTE (SELL)
                    if (price > m.high_sweep && m.step === 0) { 
                        m.step = 1; m.status = "LIQUIDITY SWEEP (H)"; 
                        addLog(`${sym} : Liquidité haute prise.`); 
                    }
                    if (m.step === 1 && price < m.high_sweep - 2) { 
                        m.step = 2; m.status = "BOS SELL CONFIRMÉ"; 
                    }
                    if (m.step === 2 && price >= m.high_sweep - 0.5) {
                        const sl = m.high_sweep + 2.5;
                        const tp1 = price - ((sl - price) * 2.5);
                        envoiSignal(sym, "SELL", price, sl, tp1, m.min_session);
                        m.active_trade = { type: "SELL", entry: price, tp1: tp1 };
                        resetMarket(m);
                    }

                    // 🔵 LOGIQUE SMC : ACHAT (BUY)
                    if (price < m.low_sweep && m.step === 0) { 
                        m.step = -1; m.status = "LIQUIDITY SWEEP (L)"; 
                        addLog(`${sym} : Liquidité basse prise.`); 
                    }
                    if (m.step === -1 && price > m.low_sweep + 2) { 
                        m.step = -2; m.status = "BOS BUY CONFIRMÉ"; 
                    }
                    if (m.step === -2 && price <= m.low_sweep + 0.5) {
                        const sl = m.low_sweep - 2.5;
                        const tp1 = price + ((price - sl) * 2.5);
                        envoiSignal(sym, "BUY", price, sl, tp1, m.max_session);
                        m.active_trade = { type: "BUY", entry: price, tp1: tp1 };
                        resetMarket(m);
                    }

                    if (price > m.max_session) m.max_session = price;
                    if (price < m.min_session) m.min_session = price;
                }
            }, 10000);
            await new Promise(r => setTimeout(r, 10000));
        } catch (e) { addLog(`Erreur flux ${sym}: Reconnexion...`); }
    }
}

function envoiSignal(sym, type, entry, sl, tp1, tpFinal) {
    const emoji = type === "BUY" ? "🔵" : "🔴";
    const msg = `🔥 **SIGNAL VVIP Mc ANTHONIO**\n\n📈 ACTIF : **${sym}**\n${emoji} ORDRE : **${type}**\n\n🎯 ENTRÉE : **${entry.toFixed(2)}**\n🛑 STOP : **${sl.toFixed(2)}**\n💰 TP1 : **${tp1.toFixed(2)}**\n🚀 TP FINAL : **${tpFinal.toFixed(2)}**\n\n*Analyse SMC - Automatisée*`;
    bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
}

function resetMarket(m) {
    m.step = 0;
    m.status = "SCANNING";
    m.high_sweep = m.price + 15;
    m.low_sweep = m.price - 15;
}

app.listen(PORT, () => startRobot());
