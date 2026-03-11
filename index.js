const express = require('express');
const puppeteer = require('puppeteer');
const { Telegraf } = require('telegraf');
const app = express();

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const PORT = process.env.PORT || 10000;

let markets = {
    'PAIN400': { price: 0, sweep_level: 0, status: "SCANNING", step: 0 },
    'GAIN400': { price: 0, sweep_level: 0, status: "SCANNING", step: 0 }
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
    <body style="background:#020202;color:#00ff00;font-family:monospace;padding:20px;margin:0;overflow-x:hidden;">
        <div style="border-bottom:2px solid #ff8800;display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;">
            <h1 style="color:#ff8800;margin:0;font-size:20px;">VVIP TERMINAL - MC ANTHONIO</h1>
            <div style="background:#ff8800;color:#000;padding:5px 12px;font-weight:bold;font-size:12px;border-radius:2px;">TIMEFRAME: M5</div>
        </div>

        <div style="display:flex;gap:15px;margin:20px 0;">
            ${Object.keys(markets).map(m => `
                <div style="border:1px solid #222;background:#080808;padding:15px;flex:1;">
                    <div style="color:#00e5ff;font-size:11px;font-weight:bold;text-transform:uppercase;">${m} / WELTRADE</div>
                    <div style="font-size:35px;font-weight:bold;color:#fff;margin:5px 0;">${markets[m].price || '...'}</div>
                    <div style="display:flex;gap:4px;margin:10px 0;">
                        <div style="flex:1;height:15px;font-size:8px;display:flex;align-items:center;justify-content:center;background:${markets[m].step >= 1 ? '#00ff00' : '#222'};color:#000;">SWEEP</div>
                        <div style="flex:1;height:15px;font-size:8px;display:flex;align-items:center;justify-content:center;background:${markets[m].step >= 2 ? '#00ff00' : '#222'};color:#000;">BOS</div>
                        <div style="flex:1;height:15px;font-size:8px;display:flex;align-items:center;justify-content:center;background:${markets[m].step >= 3 ? '#00ff00' : '#222'};color:#000;">PULLBACK</div>
                        <div style="flex:1;height:15px;font-size:8px;display:flex;align-items:center;justify-content:center;background:${markets[m].step >= 4 ? '#ff8800' : '#222'};color:#000;">ENTRY</div>
                    </div>
                    <div style="font-size:10px;color:#00e5ff;text-transform:uppercase;">${markets[m].status}</div>
                </div>
            `).join('')}
        </div>

        <div style="background:#111;border:1px solid #333;margin-bottom:20px;">
            <iframe id="tv" src="https://s.tradingview.com/widgetembed/?symbol=WELTRADE%3APAIN400&interval=5&theme=dark" width="100%" height="380px" style="border:none;"></iframe>
        </div>

        <div style="background:#050505;border:1px solid #222;padding:10px;height:100px;font-size:10px;overflow:hidden;">
            <div style="color:#ff8800;border-bottom:1px solid #222;margin-bottom:5px;">REAL-TIME ACTIVITY LOGS</div>
            ${logs.map(l => `<div style="color:#777;">> ${l}</div>`).join('')}
        </div>
        <script>setTimeout(()=>location.reload(), 15000);</script>
    </body>
    `);
});

async function startRobot() {
    addLog("Initialisation du navigateur Puppeteer...");
    try {
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        addLog("Connexion aux serveurs Weltrade...");
        await page.goto('https://www.tradingview.com/chart/?symbol=WELTRADE:PAIN400', { waitUntil: 'networkidle2', timeout: 90000 });
        addLog("Flux M5 synchronisé. Analyse active.");

        setInterval(async () => {
            try {
                const priceText = await page.evaluate(() => {
                    const el = document.querySelector('.last-K_uL78S-');
                    return el ? el.innerText : null;
                });

                if (priceText) {
                    const currentPrice = parseFloat(priceText.replace(',', ''));
                    markets.PAIN400.price = currentPrice;
                    runSMCLogic('PAIN400', currentPrice);
                }
            } catch (e) {}
        }, 6000);
    } catch (err) {
        addLog("Erreur de lancement: " + err.message);
    }
}

function runSMCLogic(id, price) {
    let m = markets[id];
    
    // Initialisation dynamique du niveau de liquidité au premier passage
    if (m.sweep_level === 0) { 
        m.sweep_level = price + 10.5; 
        m.status = "SCANNING M5";
        return; 
    }

    // ETAPE 1 : SWEEP DE LIQUIDITE
    if (price > m.sweep_level && m.step === 0) {
        m.step = 1;
        m.status = "LIQUIDITY SWEEP DETECTED";
        addLog(`${id}: Sweep détecté à ${price}`);
    }

    // ETAPE 2 : BOS (BREAK OF STRUCTURE)
    if (m.step === 1 && price < m.sweep_level - 2.8) {
        m.step = 2;
        m.status = "BOS CONFIRMED - WAITING PULLBACK";
        addLog(`${id}: Structure cassée. Attente pullback vers ${m.sweep_level}`);
    }

    // ETAPE 3 : PULLBACK (Retour vers le niveau balayé)
    if (m.step === 2 && price >= m.sweep_level - 1.2) {
        m.step = 3;
        m.status = "PULLBACK IN PROGRESS";
        addLog(`${id}: Prix en zone de pullback.`);
    }

    // ETAPE 4 : ENTRY (Toucher précis du niveau sweeped)
    if (m.step === 3 && price >= m.sweep_level - 0.2) {
        m.step = 4;
        m.status = "ENTRY EXECUTED";
        sendSignalTelegram(id, price);
        
        // Pause de 2 min avant de réinitialiser pour éviter les faux signaux en boucle
        setTimeout(() => {
            m.step = 0;
            m.sweep_level = price + 15;
            m.status = "SCANNING M5";
        }, 120000);
    }
}

async function sendSignalTelegram(asset, price) {
    const msg = `🔥 **VVIP EXECUTION : ${asset}**\n━━━━━━━━━━━━━━━━━━\n📈 **TIMEFRAME :** M5\n🔴 **ORDRE :** SELL (Limit Reached)\n🎯 **ENTRÉE :** ${price}\n✅ **STRATÉGIE :** Sweep + BOS + Pullback\n━━━━━━━━━━━━━━━━━━\n🔱 *Mc Anthonio - High Precision Trading*`;
    bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' }).catch(e => console.error("Telegram Error"));
    addLog(`SIGNAL ENVOYE: SELL ${asset} @ ${price}`);
}

app.listen(PORT, () => {
    console.log(`> Terminal VVIP Live sur port ${PORT}`);
    startRobot();
});
