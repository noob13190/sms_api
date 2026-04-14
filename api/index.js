const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();

// --- 🛑 PANEL CREDENTIALS ---
const PANEL = {
    loginUrl: "http://185.2.83.39/ints/login",
    statsUrl: "http://185.2.83.39/ints/agent/SMSCDRStats",
    user: "Kanav1",
    pass: "Kanav1"
};

function detectApp(smsText, cliText) {
    let text = (smsText + " " + cliText).toLowerCase();
    if (text.includes('whatsapp') || text.includes('wa')) return 'WhatsApp';
    if (text.includes('telegram') || text.includes('tg')) return 'Telegram';
    if (text.includes('facebook') || text.includes('fb')) return 'Facebook';
    return cliText || 'System'; 
}

app.get('/api/get-all-otps', async (req, res) => {
    try {
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar, timeout: 20000 }));

        // 1. Math Captcha Logic
        const loginPage = await client.get(PANEL.loginUrl);
        const $ = cheerio.load(loginPage.data);
        const captchaText = $('label:contains("=")').text() || $('div:contains("=")').text();
        let ans = 0;
        if (captchaText) {
            const nums = captchaText.match(/\d+/g);
            if (nums && nums.length >= 2) ans = parseInt(nums[0]) + parseInt(nums[1]);
        }

        // 2. Login Process
        const loginData = new URLSearchParams();
        loginData.append('username', PANEL.user);
        loginData.append('password', PANEL.pass);
        loginData.append('capt', ans);
        
        await client.post(PANEL.loginUrl, loginData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // 3. Fetch CDR Stats Table
        const statsRes = await client.get(PANEL.statsUrl);
        const $stats = cheerio.load(statsRes.data);
        
        // 🔍 DEBUGGING TOOLS (Pata lagane ke liye ke masla kahan hai)
        const pageTitle = $stats('title').text().trim();
        const rawRowsCount = $stats('table tbody tr').length;
        const firstRowText = rawRowsCount > 0 ? $stats('table tbody tr').first().text().trim().replace(/\s+/g, ' ') : "No rows found";

        let otps = [];

        $stats('table tbody tr').each((i, row) => {
            const tds = $stats(row).find('td');
            
            // Ab maine condition thori naram kar di hai taake kuch na kuch pakar le
            if (tds.length >= 4 && !$stats(row).text().includes('No data')) {
                let number = $stats(tds[2]).text().trim(); 
                let cli = $stats(tds[3]).text().trim(); 
                let fullSms = $stats(tds[5]).text().trim() || $stats(tds[4]).text().trim(); // Fallback if columns shifted
                
                let waMatch = fullSms.match(/(\d{3})[-\s](\d{3})/);
                let looseMatch = fullSms.match(/\b\d{4,8}\b/);
                let extractedOtp = waMatch ? (waMatch[1] + waMatch[2]) : (looseMatch ? looseMatch[0] : "Code");
                
                let appName = detectApp(fullSms, cli);

                if(number && fullSms) {
                    otps.push({ number, app: appName, otp: extractedOtp, sms_content: fullSms });
                }
            }
        });

        // 🚨 Naya JSON Response jo waja batayega
        res.json({ 
            status: true, 
            total: otps.length, 
            debug_info: {
                current_page: pageTitle,
                rows_in_html: rawRowsCount,
                first_row_data: firstRowText
            },
            data: otps 
        });

    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

module.exports = app;
