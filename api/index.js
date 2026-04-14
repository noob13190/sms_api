const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();

// --- 🛑 PANEL CREDENTIALS ---
const PANEL = {
    loginUrl: "http://185.2.83.39/ints/login",
    statsUrl: "http://185.2.83.39/ints/agent/SMSCDRStats", // 👈 Naya URL yahan laga diya hai
    user: "Kanav1", // ⚠️ Yahan Username daalein
    pass: "Kanav1"  // ⚠️ Yahan Password daalein
};

// --- 🔍 SMART APP DETECTOR ---
function detectApp(smsText, cliText) {
    let text = (smsText + " " + cliText).toLowerCase();
    if (text.includes('whatsapp') || text.includes('wa')) return 'WhatsApp';
    if (text.includes('telegram') || text.includes('tg')) return 'Telegram';
    if (text.includes('facebook') || text.includes('fb')) return 'Facebook';
    if (text.includes('google')) return 'Google';
    if (text.includes('tiktok')) return 'TikTok';
    if (text.includes('instagram') || text.includes('ig')) return 'Instagram';
    return cliText || 'System'; // Agar message mein naam na ho toh CLI utha lega
}

app.get('/api/get-all-otps', async (req, res) => {
    try {
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar, timeout: 20000 }));

        // 1. Solve Math Captcha (X + Y =) Auto-Pilot 🚀
        const loginPage = await client.get(PANEL.loginUrl);
        const $ = cheerio.load(loginPage.data);
        const captchaText = $('label:contains("=")').text() || $('div:contains("=")').text();
        let ans = 0;
        if (captchaText) {
            const nums = captchaText.match(/\d+/g);
            if (nums && nums.length >= 2) ans = parseInt(nums[0]) + parseInt(nums[1]);
        }

        // 2. Auto Login Process
        const loginData = new URLSearchParams();
        loginData.append('username', PANEL.user);
        loginData.append('password', PANEL.pass);
        loginData.append('capt', ans);
        await client.post(PANEL.loginUrl, loginData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // 3. Fetch Data from New CDR Stats Table
        const statsRes = await client.get(PANEL.statsUrl);
        const $stats = cheerio.load(statsRes.data);
        let otps = [];

        // Table ki rows parhna shuru karega
        $stats('table tbody tr').each((i, row) => {
            const tds = $stats(row).find('td');
            
            // CDR table mein kam az kam 6 columns zaroori hain SMS tak pohnchne k liye
            if (tds.length >= 6 && !$stats(row).text().includes('No data')) {
                
                // 🎯 Columns targeting based on your format: Date | Range | Number | CLI | Client | SMS
                let number = $stats(tds[2]).text().trim();      // Column 3 = Number
                let cli = $stats(tds[3]).text().trim();         // Column 4 = CLI (App Name)
                let fullSms = $stats(tds[5]).text().trim();     // Column 6 = Message Content
                
                // OTP Extractor
                let waMatch = fullSms.match(/(\d{3})[-\s](\d{3})/); // WhatsApp k liye (123-456)
                let looseMatch = fullSms.match(/\b\d{4,8}\b/);      // Normal 4 se 8 digit k liye
                let extractedOtp = waMatch ? (waMatch[1] + waMatch[2]) : (looseMatch ? looseMatch[0] : "Code");
                
                // Smart App Name Detector
                let appName = detectApp(fullSms, cli);

                if(number && fullSms) {
                    otps.push({
                        number: number,
                        app: appName,
                        otp: extractedOtp,
                        sms_content: fullSms
                    });
                }
            }
        });

        res.json({ status: true, total: otps.length, data: otps });

    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

module.exports = app;
