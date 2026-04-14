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
        const jar = new CookieJar();
        const client = wrapper(axios.create({ 
            jar, 
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            maxRedirects: 5 // Redirects ko auto-follow karega
        }));

        // 1. Kholo Login Page (Taa ke Server Cookie de de)
        const loginPage = await client.get(PANEL.loginUrl);
        const $ = cheerio.load(loginPage.data);
        
        // 2. Math Captcha Logic
        const bodyText = $('body').text().replace(/\s+/g, ' ');
        const mathMatch = bodyText.match(/(\d+)\s*\+\s*(\d+)/);
        let ans = 0;
        if (mathMatch) {
            ans = parseInt(mathMatch[1]) + parseInt(mathMatch[2]);
        }

        // 3. Prepare Login Data
        let loginData = new URLSearchParams();
        loginData.append('username', PANEL.user);
        loginData.append('password', PANEL.pass);
        loginData.append('capt', ans.toString());

        // 4. 🔥 VIP FIX: Asli Browser Headers (Server Firewall Bypass)
        await client.post(PANEL.loginUrl, loginData.toString(), {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'http://185.2.83.39',
                'Referer': 'http://185.2.83.39/ints/login',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        // 5. Form bhejne ke baad CDR page par jao
        const statsRes = await client.get(PANEL.statsUrl, {
            headers: {
                'Referer': 'http://185.2.83.39/ints/agent/dashboard' // Server ko lagay dashboard se click karke aaya hai
            }
        });
        
        const $stats = cheerio.load(statsRes.data);
        const pageTitle = $stats('title').text().trim();

        if (pageTitle.toLowerCase().includes("login")) {
            return res.json({ 
                status: false, 
                error: "Headers bypass bhi fail ho gaya. Panel strictly IP check kar raha hai ya cookies drop kar raha hai."
            });
        }

        // 6. 🚀 DATA EXTRACTION
        let otps = [];
        $stats('table tbody tr').each((i, row) => {
            const tds = $stats(row).find('td');
            if (tds.length >= 6 && !$stats(row).text().includes('No data')) {
                let number = $stats(tds[2]).text().trim();      
                let cli = $stats(tds[3]).text().trim();         
                let fullSms = $stats(tds[5]).text().trim() || $stats(tds[4]).text().trim();
                
                let waMatch = fullSms.match(/(\d{3})[-\s](\d{3})/); 
                let looseMatch = fullSms.match(/\b\d{4,8}\b/);      
                let extractedOtp = waMatch ? (waMatch[1] + waMatch[2]) : (looseMatch ? looseMatch[0] : "Code");
                let appName = detectApp(fullSms, cli);

                if(number && fullSms) {
                    otps.push({ number, app: appName, otp: extractedOtp, sms_content: fullSms });
                }
            }
        });

        res.json({ status: true, total: otps.length, data: otps });

    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

module.exports = app;
