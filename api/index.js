const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();

// --- 🛑 PANEL CREDENTIALS ---
const PANEL = {
    loginUrl: "http://185.2.83.39/ints/login",
    statsUrl: "http://185.2.83.39/ints/agent/SMSNumberStats",
    user: "Kanav1", // ⚠️ Yahan Username daalein
    pass: "Kanav1"  // ⚠️ Yahan Password daalein
};

// --- 🔍 SMART APP DETECTOR ---
function detectApp(smsText) {
    let s = smsText.toLowerCase();
    if (s.includes('whatsapp') || s.includes('wa')) return 'WhatsApp';
    if (s.includes('telegram') || s.includes('tg')) return 'Telegram';
    if (s.includes('facebook') || s.includes('fb')) return 'Facebook';
    if (s.includes('google')) return 'Google';
    if (s.includes('tiktok')) return 'TikTok';
    if (s.includes('instagram') || s.includes('ig')) return 'Instagram';
    return 'System'; // Agar koi match na ho
}

app.get('/api/get-all-otps', async (req, res) => {
    try {
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar, timeout: 20000 }));

        // 1. Solve Math Captcha (X + Y =)
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

        // 3. Fetch Data from Stats Table
        const statsRes = await client.get(PANEL.statsUrl);
        const $stats = cheerio.load(statsRes.data);
        let otps = [];

        $stats('table tbody tr').each((i, row) => {
            const tds = $stats(row).find('td');
            
            // Ensure kam az kam 2 columns hain aur "No data" nahi likha
            if (tds.length >= 2 && !$stats(row).text().includes('No data')) {
                let number = $stats(tds[0]).text().trim();
                let fullSms = $stats(tds[1]).text().trim();
                
                // Aggressive OTP Extractor (4 se 8 digits nikalega)
                let looseMatch = fullSms.match(/\d{4,8}/);
                let extractedOtp = looseMatch ? looseMatch[0] : "Code";
                
                // Smart App Name Detector
                let appName = detectApp(fullSms);

                otps.push({
                    number: number,
                    app: appName,
                    otp: extractedOtp,
                    sms_content: fullSms
                });
            }
        });

        res.json({ status: true, total: otps.length, data: otps });

    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

module.exports = app;
