const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
app.use(express.json());

// 🛑 1. PANELS KI DETAILS (Aapke naye URLs aur Passwords k sath)
const PANELS = [
    { 
        id: 1, 
        name: "Konekta Premium", 
        loginUrl: "https://konektapremium.net/sign-in",         
        statsUrl: "https://konektapremium.net/agent/SMSClientStats", 
        user: "Kanav111", 
        pass: "Kanav121" 
    },
    { 
        id: 2, 
        name: "Panel 85.195", 
        loginUrl: "http://85.195.94.50/sms/SignIn", 
        statsUrl: "http://85.195.94.50/sms/reseller/SMSReports",  
        user: "kanav1", 
        pass: "Kanav1" 
    },
    { 
        id: 3, 
        name: "Choice Sms", 
        loginUrl: "http://51.77.52.79/ints/login", 
        statsUrl: "http://51.77.52.79/ints/agent/SMSClientStats",  
        user: "Kanav1", 
        pass: "Kanav1" 
    }
];

// ⚙️ 2. SINGLE PANEL SCRAPER FUNCTION
async function fetchOtpsFromPanel(panel) {
    try {
        console.log(`⏳ Starting extraction for: ${panel.name}...`);
        
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar, timeout: 15000 })); 

        // --- STEP A: Load Login Page & Solve Captcha ---
        const loginPageRes = await client.get(panel.loginUrl);
        const $ = cheerio.load(loginPageRes.data);
        
        let captchaText = $('label:contains("=")').text() || $('div:contains("=")').text(); 
        let captchaAnswer = 0;
        if (captchaText) {
            const numbers = captchaText.match(/\d+/g); 
            if (numbers && numbers.length >= 2) captchaAnswer = parseInt(numbers[0]) + parseInt(numbers[1]);
        }
        const csrfToken = $('input[name="csrf_token"]').val() || '';

        // --- STEP B: Submit Login ---
        const loginData = new URLSearchParams();
        loginData.append('username', panel.user);
        loginData.append('password', panel.pass);
        loginData.append('capt', captchaAnswer); 
        if (csrfToken) loginData.append('csrf_token', csrfToken); 

        await client.post(panel.loginUrl, loginData, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded', 
                'Referer': panel.loginUrl 
            }
        });

        // --- STEP C: Fetch Stats & Scrape OTPs (CORRECTED LOGIC) ---
        const statsRes = await client.get(panel.statsUrl);
        const $stats = cheerio.load(statsRes.data);

        let otps = [];
        
        $stats('table tbody tr').each((index, element) => {
            const tds = $stats(element).find('td');
            
            // Agar table khali ho toh aage na barho
            if (tds.length < 5) return; 

            // Aapke DataTables k hisaab se exact columns:
            const time = tds.eq(0).text().trim();       // Column 1: Date/Time
            const number = tds.eq(2).text().trim();     // Column 3: Number
            const sender = tds.eq(3).text().trim();     // Column 4: SenderID
            const message = tds.last().text().trim();   // Aakhri Column: Message

            if (message && message !== '') {
                otps.push({ time, sender, number, message });
            }
        });
        
        return {
            panel_name: panel.name,
            status: true,
            total: otps.length,
            data: otps
        };

    } catch (error) {
        return {
            panel_name: panel.name,
            status: false,
            message: "Failed to fetch",
            error: error.message,
            data: []
        };
    }
}

// 🌐 3. MAIN MULTI-API ENDPOINT
app.get('/api/get-all-otps', async (req, res) => {
    try {
        const results = await Promise.all(PANELS.map(panel => fetchOtpsFromPanel(panel)));

        let allOtpsCombined = [];
        let totalOtps = 0;
        
        results.forEach(res => {
            if (res.status) {
                totalOtps += res.total;
                const taggedOtps = res.data.map(otp => ({ ...otp, source_panel: res.panel_name }));
                allOtpsCombined.push(...taggedOtps);
            }
        });

        return res.status(200).json({
            status: true,
            creator: "Shahzaib Tech API",
            total_panels_checked: PANELS.length,
            total_otps_found: totalOtps,
            panel_reports: results, 
            all_otps: allOtpsCombined 
        });

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: "Master API Error",
            error: error.message
        });
    }
});

// Root route for friendly message
app.get('/', (req, res) => res.send('<h2>💎 Shahzaib Tech API is LIVE</h2><p>Go to <a href="/api/get-all-otps">/api/get-all-otps</a></p>'));

module.exports = app;
