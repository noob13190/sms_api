const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// 💎 AAPKI ZINDA COOKIE YAHAN HAI
const MY_COOKIE = "PHPSESSID=5fo5g7gqc6trsr2mv1fciig1pn";

// --- 🔍 SMART APP DETECTOR ---
function detectApp(smsText, cliText) {
    let text = (smsText + " " + cliText).toLowerCase();
    if (text.includes('whatsapp') || text.includes('wa')) return 'WhatsApp';
    if (text.includes('telegram') || text.includes('tg')) return 'Telegram';
    if (text.includes('facebook') || text.includes('fb')) return 'Facebook';
    if (text.includes('google')) return 'Google';
    if (text.includes('tiktok')) return 'TikTok';
    if (text.includes('instagram') || text.includes('ig')) return 'Instagram';
    return cliText || 'System'; 
}

// --- 🔑 OTP EXTRACTOR ---
function extractOTP(text) {
    if (!text) return "Code";
    let waMatch = text.match(/(\d{3})[-\s](\d{3})/);
    if (waMatch) return waMatch[1] + waMatch[2];
    let looseMatch = text.match(/\b\d{4,8}\b/);
    if (looseMatch) return looseMatch[0];
    return "Code";
}

// DataTables kabhi kabhi text HTML tags (jaise <span>) ke andar bhejta hai, yeh usko saaf karega
function stripHtml(html) {
    if (!html) return "";
    return html.toString().replace(/<[^>]*>?/gm, '').trim();
}

app.get('/api/get-all-otps', async (req, res) => {
    try {
        // 🔄 AUTO-DATE GENERATOR (Taake kal bhi naya data aaye)
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const today = `${yyyy}-${mm}-${dd}`; // Result: 2026-04-14
        
        // 🔗 THE ULTIMATE HIDDEN AJAX LINK (Auto-Updating Date)
        // Note: iDisplayLength=100 kar diya hai taake ek baari mein 100 SMS pakar le
        const hiddenApiUrl = `http://185.2.83.39/ints/agent/res/data_smscdr.php?fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59&fg=0&sesskey=Q05RR0FSUEVCVw==&sEcho=1&iColumns=9&iDisplayStart=0&iDisplayLength=100&sSortDir_0=desc`;

        // 🔥 DIRECT HIT TO PANEL SERVER
        const response = await axios.get(hiddenApiUrl, {
            headers: {
                'Cookie': MY_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest' // Panel ko lagega page ne request bheji hai
            },
            timeout: 10000
        });

        // DataTables apni array ko 'aaData' ya 'data' ke andar bhejta hai
        const rows = response.data.aaData || response.data.data || [];
        
        if (rows.length === 0) {
            return res.json({ status: true, total: 0, debug_info: "AJAX API properly hit hui, par aaj koi SMS nahi hai.", data: [] });
        }

        let otps = [];
        
        // JSON array loop (HTML ka chakar khatam)
        rows.forEach(row => {
            // X-Ray Match: row[2] = Number, row[3] = CLI, row[5] = SMS
            let number = stripHtml(row[2]);
            let cli = stripHtml(row[3]);
            let fullSms = stripHtml(row[5]);
            
            let extractedOtp = extractOTP(fullSms);
            let appName = detectApp(fullSms, cli);

            if(number && fullSms) {
                otps.push({ number, app: appName, otp: extractedOtp, sms_content: fullSms });
            }
        });

        res.json({ status: true, total: otps.length, data: otps });

    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

// Port 0.0.0.0 takay pori dunya se access ho
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 ULTIMATE LIGHTNING API Live on port ${PORT}`);
});

module.exports = app;
