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
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
        }));

        // 1. Pehle Login Page Kholo
        const loginPage = await client.get(PANEL.loginUrl);
        const $ = cheerio.load(loginPage.data);
        
        // 2. Math Captcha ko Aggressively Pakro (e.g. "What is 6 + 3 = ?")
        const bodyText = $('body').text().replace(/\s+/g, ' ');
        const mathMatch = bodyText.match(/(\d+)\s*\+\s*(\d+)/);
        let ans = 0;
        if (mathMatch) {
            ans = parseInt(mathMatch[1]) + parseInt(mathMatch[2]);
        }

        // 3. 🔥 SMART FORM READER (Hidden Tokens & Dynamic Field Names)
        let loginData = new URLSearchParams();
        let debugFormInputs = []; // Debugging ke liye

        $('form input').each((i, el) => {
            let name = $(el).attr('name');
            let type = $(el).attr('type') || 'text';
            let val = $(el).attr('value') || '';
            
            if (name) {
                debugFormInputs.push({ name, type, value: val });
                
                // Agar hidden security field hai, toh wesi hi bhej do
                if (type === 'hidden') {
                    loginData.append(name, val); 
                } 
                // Agar Password field hai
                else if (type === 'password' || name.toLowerCase().includes('pass')) {
                    loginData.append(name, PANEL.pass);
                } 
                // Agar Username/Email field hai
                else if (name.toLowerCase().includes('user') || name.toLowerCase().includes('email')) {
                    loginData.append(name, PANEL.user);
                } 
                // Agar Captcha field hai
                else if (name.toLowerCase().includes('capt') || name.toLowerCase().includes('ans') || type === 'number') {
                    loginData.append(name, ans);
                }
            }
        });

        // 4. Submit Auto-Filled Form
        await client.post(PANEL.loginUrl, loginData, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded', 
                'Referer': PANEL.loginUrl 
            }
        });

        // 5. Check CDR Stats Page (Kamiyabi mili ya nahi?)
        const statsRes = await client.get(PANEL.statsUrl);
        const $stats = cheerio.load(statsRes.data);
        const pageTitle = $stats('title').text().trim();

        // 🚨 AGAR LOGIN FAIL HUA TOH POORI REPORT DO
        if (pageTitle.toLowerCase().includes("login")) {
            return res.json({ 
                status: false, 
                error: "Form submit kiya par wapis Login par bhej diya. Debug data dekhein:", 
                debug_info: {
                    math_found: mathMatch ? `${mathMatch[1]} + ${mathMatch[2]} = ${ans}` : "Math nahi mila",
                    panel_required_fields: debugFormInputs,
                    data_we_sent: loginData.toString()
                }
            });
        }

        // 6. 🚀 DATA EXTRACTION (Jab Login Successful ho jaye)
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
