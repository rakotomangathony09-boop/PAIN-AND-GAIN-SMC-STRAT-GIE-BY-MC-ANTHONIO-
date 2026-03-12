const express = require('express');
const puppeteer = require('puppeteer');
const { Telegraf } = require('telegraf');
const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const PORT = process.env.PORT || 10000;

let markets = {
    'PAIN400': { price: 0, sweep_level: 0, status: "SCANNING M5", step: 0 }
};
let logs = [];

function addLog(msg) {
    const t = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Indian/Antananarivo' });
    logs.unshift(`[${t}] ${msg}`);
    if (logs.length > 8) logs.pop();
    console.log(`> ${msg}`);
}

app.get('/', (req, res) => {
    res.send(`
    <body style="background:#020202;color:#00ff00;font-family:monospace;padding:20px;margin:0;">
        <h1 style="color:#ff8800;border-bottom:2px solid #ff8800;padding-bottom:10px;">VVIP TERMINAL - MC ANTHONIO</h1>
        <div style="display:flex;gap:15px;margin:20px 0;">
            <div style="border:1px solid #222;background:#080808;padding:15px;flex:1;">
                <div style="color:#00e5ff;font-size:11px;">PAIN 400 LIVE</div>
                <div style="font-size:35px;font-weight:bold;color:#fff;">${markets.PAIN400.price || '...'}</div>
                <div style="font-size:10px;color:#00e5ff;">STATUS: ${markets.PAIN400.status}</div>
            </div>
        </div>
        <div style="background:#050505;border:1px solid #222;padding:10px;color:#777;font-size:12px;">
            <div style="color:#ff8800;margin-bottom:5px;">LOGS D'ANALYSE :</div>
            ${logs.map(l => `<div>> ${l}</div>`).join('')}
        </div>
        <script>setTimeout(()=>location.reload(), 10000);</script>
    </body>
    `);
});

async function startRobot() {
    addLog("Lancement du moteur Mc Anthonio...");
    try {
        const browser = await puppeteer.launch({ 
            executablePath: '/usr/bin/google-chrome', // Utilise le Chrome de Render
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.goto('https://www.tradingview.com/chart/?symbol=WELTRADE:PAIN400', { waitUntil: 'networkidle2' });
        
        addLog("Flux Weltrade Synchronisé.");

        setInterval(async () => {
            try {
                const priceText = await page.evaluate(() => {
                    const el = document.querySelector('.last-K_uL78S-');
                    return el ? el.innerText : null;
                });

                if (priceText) {
                    const price = parseFloat(priceText.replace(',', ''));
                    markets.PAIN400.price = price;
                    
                    let m = markets.PAIN400;
                    if (m.sweep_level === 0) { m.sweep_level = price + 10; return; }

                    // LOGIQUE SMC
                    if (price > m.sweep_level && m.step === 0) {
                        m.step = 1; m.status = "LIQUIDITY SWEEP";
                        addLog("Alerte: Sweep détecté !");
                    }
                    if (m.step === 1 && price < m.sweep_level - 3) {
                        m.step = 2; m.status = "BOS CONFIRMED";
                        addLog("Alerte: Cassure de structure !");
                    }
                    if (m.step === 2 && price >= m.sweep_level - 0.5) {
                        m.step = 3;
                        const msg = `🔥 **SIGNAL VVIP MC ANTHONIO**\n📈 PAIN 400 (M5)\n🔴 ORDRE : SELL\n🎯 PRIX : ${price}\n✅ Stratégie : SMC Sweep + BOS`;
                        bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
                        addLog("SIGNAL ENVOYÉ SUR TELEGRAM");
                        setTimeout(() => { m.step = 0; m.sweep_level = price + 10; }, 60000);
                    }
                }
            } catch (e) {}
        }, 8000);
    } catch (err) { addLog("Erreur: " + err.message); }
}

app.listen(PORT, () => startRobot());
