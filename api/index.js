const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// 🛑 --- UPDATE BOTH OF THESE FROM YOUR BROWSER --- 🛑
const MY_COOKIE = "PHPSESSID=5fo5g7gqc6trsr2mv1fciig1pn"; // <--- Nayi Cookie (document.cookie)
const MY_SESSKEY = "Q05RR0FSUEVDTg=="; // <--- ✅ UPDATED: New Sesskey from your link
// 🛑 ---------------------------------------------- 🛑

function detectApp(smsText, cliText) {
    let text = (smsText + " " + cliText).toLowerCase();
    if (text.includes('whatsapp') || text.includes('wa')) return 'WhatsApp';
    if (text.includes('facebook') || text.includes('fb')) return 'Facebook';
    if (text.includes('telegram') || text.includes('tg')) return 'Telegram';
    if (text.includes('google')) return 'Google';
    return cliText || 'System'; 
}

function extractOTP(text) {
    if (!text) return "Code";
    let waMatch = text.match(/(\d{3})[-\s](\d{3})/);
    if (waMatch) return waMatch[1] + waMatch[2];
    let looseMatch = text.match(/\b\d{4,8}\b/);
    if (looseMatch) return looseMatch[0];
    return "Code";
}

app.get('/api/get-all-otps', async (req, res) => {
    try {
        const d = new Date();
        const y2 = d.getFullYear();
        const m2 = String(d.getMonth() + 1).padStart(2, '0');
        const d2 = String(d.getDate()).padStart(2, '0');
        const today = `${y2}-${m2}-${d2}`;

        // Pichle 48 ghantay ka data uthane ke liye
        const yesterday = new Date(d);
        yesterday.setDate(d.getDate() - 1);
        const dateFrom = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

        const ts = Date.now(); 

        // 🔗 Naye Sesskey ke sath updated URL
        const hiddenApiUrl = `http://185.2.83.39/ints/agent/res/data_smscdr.php?fdate1=${dateFrom}%2000:00:00&fdate2=${today}%2023:59:59&fg=0&sesskey=${MY_SESSKEY}&sEcho=1&iColumns=9&iDisplayStart=0&iDisplayLength=100&sSortDir_0=desc&_=${ts}`;

        const response = await axios.get(hiddenApiUrl, {
            headers: {
                'Cookie': MY_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            },
            timeout: 15000
        });

        // Diagnostic Check
        if (typeof response.data === 'string' && response.data.includes('login')) {
            return res.json({ status: false, error: "Session Expired! Nayi Cookie dalo." });
        }

        const rows = response.data.aaData || response.data.data || [];
        let otps = [];
        
        rows.forEach(row => {
            let number = row[2] ? row[2].toString().replace(/<[^>]*>?/gm, '').trim() : "";
            let cli = row[3] ? row[3].toString().replace(/<[^>]*>?/gm, '').trim() : "";
            let fullSms = row[5] ? row[5].toString().replace(/<[^>]*>?/gm, '').trim() : "";
            
            if(number && fullSms) {
                otps.push({
                    number,
                    app: detectApp(fullSms, cli),
                    otp: extractOTP(fullSms),
                    sms_content: fullSms
                });
            }
        });

        res.json({ 
            status: true, 
            total: otps.length, 
            range: `${dateFrom} to ${today}`,
            data: otps 
        });

    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Updated with New Sesskey on port ${PORT}`);
});
