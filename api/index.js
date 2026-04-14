const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();

// --- 🛑 PANEL CREDENTIALS ---
const PANEL = {
    loginUrl: "http://185.2.83.39/ints/login",
    statsUrl: "http://185.2.83.39/ints/agent/SMSCDRStats", // 👈 Seedha naye CDR page par jayega
    user: "Kanav1",
    pass: "Kanav1"
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
    return cliText || 'System'; 
}

app.get('/api/get-all-otps', async (req, res) => {
    try {
        // Session Jar (Taake bot login yaad rakhe)
        const jar = new CookieJar();
        const client = wrapper(axios.create({ 
            jar, 
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
            }
        }));

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
            
            // CDR table mein Number 3rd column, CLI 4th, aur SMS 6th column mein hai
            if (tds.length >= 6 && !$stats(row).text().includes('No data')) {
                let number = $stats(tds[2]).text().trim();      // Column 3 = Number
                let cli = $stats(tds[3]).text().trim();         // Column 4 = CLI (App Name)
                let fullSms = $stats(tds[5]).text().trim();     // Column 6 = Message Content
                
                // OTP Extractor
                let waMatch = fullSms.match(/(\d{3})[-\s](\d{3})/); 
                let looseMatch = fullSms.match(/\b\d{4,8}\b/);      
                let extractedOtp = waMatch ? (waMatch[1] + waMatch[2]) : (looseMatch ? looseMatch[0] : "Code");
                
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

        // Agar ghalti se login na ho, toh waja bhi json mein aayegi
        const pageTitle = $stats('title').text().trim();
        if (pageTitle.toLowerCase().includes("login")) {
            return res.json({ status: false, error: "Login fail ho gaya (Shayad credentials change hue hain)", total: 0, data: [] });
        }

        res.json({ status: true, total: otps.length, data: otps });

    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

module.exports = app;
