const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// 💎 AAPKI ZINDA COOKIE
const MY_COOKIE = "PHPSESSID=5fo5g7gqc6trsr2mv1fciig1pn";

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
    let strictMatch = text.match(/\b\d{4,8}\b/);
    if (strictMatch) return strictMatch[0];
    let looseMatch = text.match(/\d{4,8}/);
    if (looseMatch) return looseMatch[0];
    return text.length > 10 ? text.substring(0, 10) + ".." : text;
}

function stripHtml(html) {
    if (!html) return "";
    return html.toString().replace(/<[^>]*>?/gm, '').trim();
}

app.get('/api/get-all-otps', async (req, res) => {
    try {
        // 🔄 DATE LOGIC: Aaj aur Kal (Pichle 48 ghantay ka data)
        const d = new Date();
        const y2 = d.getFullYear();
        const m2 = String(d.getMonth() + 1).padStart(2, '0');
        const d2 = String(d.getDate()).padStart(2, '0');
        const dateTo = `${y2}-${m2}-${d2}`; // Aaj ki date

        const yesterday = new Date(d);
        yesterday.setDate(d.getDate() - 1); // Kal ki date
        const y1 = yesterday.getFullYear();
        const m1 = String(yesterday.getMonth() + 1).padStart(2, '0');
        const d1 = String(yesterday.getDate()).padStart(2, '0');
        const dateFrom = `${y1}-${m1}-${d1}`;

        // 🔥 VIP: Cache Buster (Server ko majboor karega fresh list bhejne par)
        const ts = Date.now(); 

        // 🔗 URL UPDATE: Humne dateFrom ko 1 din peechay kar diya hai taake "ALL" data aaye
        const hiddenApiUrl = `http://185.2.83.39/ints/agent/res/data_smscdr.php?fdate1=${dateFrom}%2000:00:00&fdate2=${dateTo}%2023:59:59&fg=0&sesskey=Q05RR0FSUEVCVw==&sEcho=1&iColumns=9&iDisplayStart=0&iDisplayLength=100&sSortDir_0=desc&_=${ts}`;

        const response = await axios.get(hiddenApiUrl, {
            headers: {
                'Cookie': MY_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'http://185.2.83.39/ints/agent/SMSCDRStats'
            },
            timeout: 15000
        });

        const rows = response.data.aaData || response.data.data || [];
        let otps = [];
        
        rows.forEach(row => {
            let number = stripHtml(row[2]);
            let cli = stripHtml(row[3]);
            let fullSms = stripHtml(row[5]);
            
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
            range: `${dateFrom} to ${dateTo}`,
            data: otps 
        });

    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ALL-DATA API Live on port ${PORT}`);
});
