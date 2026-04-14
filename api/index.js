const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 🛑 PANEL CREDENTIALS & COOKIE ---
const PANEL = {
    statsUrl: "http://185.2.83.39/ints/agent/SMSCDRStats"
};

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

app.get('/api/get-all-otps', async (req, res) => {
    try {
        // 1. Direct Request with Cookie
        const statsRes = await axios.get(PANEL.statsUrl, {
            headers: {
                'Cookie': MY_COOKIE,
                // Asli browser banne ki koshish
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            },
            timeout: 10000
        });

        const $stats = cheerio.load(statsRes.data);
        
        // 🚨 DEEP DEBUGGING TOOLS 🚨
        const pageTitle = $stats('title').text().trim();
        const tablesFound = $stats('table').length;
        const rowsFound = $stats('table tbody tr').length;
        let firstRowPreview = "No Rows Found";
        
        if (rowsFound > 0) {
            // Pehli row ka kachra text saaf kar ke dekhne ke liye
            firstRowPreview = $stats('table tbody tr').first().text().replace(/\s+/g, ' ').trim();
        }

        // Agar Login page par redirect ho gaya hai
        if (pageTitle.toLowerCase().includes("login")) {
            return res.json({ 
                status: false, 
                error: "Cookie Reject ho gayi! Panel ne wapis Login par phenk diya.",
                debug_info: { page_title: pageTitle }
            });
        }

        // 2. 🚀 DATA EXTRACTION (X-Ray Indexes)
        let otps = [];
        $stats('table tbody tr').each((i, row) => {
            const tds = $stats(row).find('td');
            
            // Cheerio mein index use karne ke liye .eq() function best rehta hai
            if (tds.length >= 6 && !$stats(row).text().includes('No data')) {
                let number = tds.eq(2).text().trim();      // Column 3 = Number
                let cli = tds.eq(3).text().trim();         // Column 4 = CLI
                let fullSms = tds.eq(5).attr('title') || tds.eq(5).text().trim(); // Column 6 = SMS
                
                let extractedOtp = extractOTP(fullSms);
                let appName = detectApp(fullSms, cli);

                if(number && fullSms) {
                    otps.push({ number, app: appName, otp: extractedOtp, sms_content: fullSms });
                }
            }
        });

        // 🎯 FINAL RESPONSE (With Debug Info)
        res.json({ 
            status: true, 
            total: otps.length, 
            debug_info: {
                page_title: pageTitle,
                tables_found: tablesFound,
                rows_found: rowsFound,
                first_row_preview: firstRowPreview
            },
            data: otps 
        });

    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

// Dunya mein kahin se bhi access ke liye 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Fast Cookie API Live on port ${PORT}`);
});

module.exports = app;
