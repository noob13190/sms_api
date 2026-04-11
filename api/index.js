const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
app.use(express.json());

// 🛑 1. APNE 3 PANELS KI DETAILS YAHAN DAALEIN
const PANELS = [
    { 
        id: 1, 
        name: "Konekta Premium", 
        loginUrl: "https://konektapremium.net/sign-in",         
        statsUrl: "https://konektapremium.net/agent/SMSClientStats", // 👉 Login k baad wala URL
        user: "Kanav111", 
        pass: "Kanav121" 
    },
    { 
        id: 2, 
        name: "Panel 85.195", 
        loginUrl: "http://85.195.94.50/sms/SignIn", 
        statsUrl: "http://85.195.94.50/sms/reseller/SMSReports",  // 👉 Confirm kar lena    
        user: "kanav1", 
        pass: "Kanav1" 
    },
    { 
        id: 3, 
        name: "Choice Sms", 
        loginUrl: "http://51.77.52.79/ints/login", 
        statsUrl: "http://51.77.52.79/ints/agent/SMSClientStats",  // 👉 Confirm kar lena 
        user: "Kanav1", 
        pass: "Kanav1" 
    }
];

// ⚙️ 2. SINGLE PANEL SCRAPER FUNCTION
async function fetchOtpsFromPanel(panel) {
    try {
        console.log(`⏳ Starting extraction for: ${panel.name}...`);
        
        // Har panel k liye naya session (cookie) banega
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar, timeout: 15000 })); 

        // --- STEP A: Load Login Page & Solve Captcha ---
        const loginPageRes = await client.get(panel.loginUrl);
        const $ = cheerio.load(loginPageRes.data);
        
        // Captcha nikalne aur solve karne ka logic (Math: 4 + 4 = 8)
        let captchaText = $('label:contains("=")').text() || $('div:contains("=")').text(); 
        let captchaAnswer = 0;
        if (captchaText) {
            const numbers = captchaText.match(/\d+/g); 
            if (numbers && numbers.length >= 2) captchaAnswer = parseInt(numbers[0]) + parseInt(numbers[1]);
        }
        const csrfToken = $('input[name="csrf_token"]').val() || '';

        // --- STEP B: Submit Login (Aapka update kiya hua hissa) ---
        const loginData = new URLSearchParams();
        
        // Console se mile hue exact names: username, password, capt
        loginData.append('username', panel.user);
        loginData.append('password', panel.pass);
        loginData.append('capt', captchaAnswer); // 👈 Yahan 'capt' set kar diya!
        
        // Agar csrf_token zaroori hua toh jaye ga warna ignore
        if (csrfToken) loginData.append('csrf_token', csrfToken); 

        await client.post(panel.loginUrl, loginData, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded', 
                'Referer': panel.loginUrl 
            }
        });

        // --- STEP C: Fetch Stats & Scrape OTPs ---
        const statsRes = await client.get(panel.statsUrl);
        const $stats = cheerio.load(statsRes.data);

        let otps = [];
        // Har table row ko check karega
        $stats('table tbody tr').each((index, element) => {
            const sender = $stats(element).find('td').eq(0).text().trim();
            const message = $stats(element).find('td').eq(1).text().trim();
            const time = $stats(element).find('td').eq(2).text().trim();

            if (message) otps.push({ sender, message, time });
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
        // Promise.all use karke teeno panels par ek sath login attack
        const results = await Promise.all(PANELS.map(panel => fetchOtpsFromPanel(panel)));

        let allOtpsCombined = [];
        let totalOtps = 0;
        
        results.forEach(res => {
            if (res.status) {
                totalOtps += res.total;
                // OTPs ke sath tag laga do ke kahan se aaye hain
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

// Vercel deployment ke liye app ko export karna lazmi hai
module.exports = app;
