const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
app.use(express.json());

// --- 🛑 PANEL CREDENTIALS ---
const PANEL = {
    name: "GAZA IPRN (144.217)",
    baseUrl: "http://144.217.71.192/ints",
    loginUrl: "http://144.217.71.192/ints/login",
    statsUrl: "http://144.217.71.192/ints/agent/SMSClientStats",
    user: "Kanav1", // ⚠️ Apna Username yahan dalein
    pass: "Kanav1"  // ⚠️ Apna Password yahan dalein
};

// --- ⚙️ SCRAPER ENGINE ---
async function fetchGazaOtps() {
    try {
        console.log(`⏳ Attacking: ${PANEL.name}...`);
        
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar, timeout: 20000 })); 

        // --- STEP 1: Load Login Page & Solve Captcha ---
        const loginPageRes = await client.get(PANEL.loginUrl);
        const $ = cheerio.load(loginPageRes.data);
        
        let captchaText = $('label:contains("=")').text() || $('div:contains("=")').text(); 
        let captchaAnswer = 0;
        
        if (captchaText) {
            const numbers = captchaText.match(/\d+/g); 
            if (numbers && numbers.length >= 2) {
                captchaAnswer = parseInt(numbers[0]) + parseInt(numbers[1]);
                console.log(`🧠 Captcha Solved: ${numbers[0]} + ${numbers[1]} = ${captchaAnswer}`);
            }
        }
        
        const csrfToken = $('input[name="csrf_token"]').val() || '';

        // --- STEP 2: Submit Login Form ---
        const loginData = new URLSearchParams();
        loginData.append('username', PANEL.user);
        loginData.append('password', PANEL.pass);
        loginData.append('capt', captchaAnswer); 
        if (csrfToken) loginData.append('csrf_token', csrfToken); 

        await client.post(PANEL.loginUrl, loginData, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded', 
                'Referer': PANEL.loginUrl 
            }
        });

        console.log(`🔑 Login Request Sent. Fetching Stats...`);

        // --- STEP 3: Fetch Stats Page ---
        const statsRes = await client.get(PANEL.statsUrl);
        const $stats = cheerio.load(statsRes.data);

        let otps = [];

        // --- STEP 4: Parse HTML Table ---
        $stats('table').each((tableIndex, tableElement) => {
            let smsColIndex = -1;
            let clientColIndex = -1;

            $stats(tableElement).find('thead th').each((i, el) => {
                const headerText = $stats(el).text().toLowerCase().trim();
                if (headerText === 'sms') smsColIndex = i;
                if (headerText === 'client') clientColIndex = i;
            });

            if (smsColIndex === -1) {
                smsColIndex = 1; 
                clientColIndex = 0;
            }

            $stats(tableElement).find('tbody tr').each((rowIndex, rowElement) => {
                const tds = $stats(rowElement).find('td');
                if (tds.length < 2) return; 

                if (tds.text().toLowerCase().includes('no data available')) return;

                const clientName = clientColIndex !== -1 ? tds.eq(clientColIndex).text().trim() : "Unknown Client";
                const smsData = smsColIndex !== -1 ? tds.eq(smsColIndex).text().trim() : "";

                if (smsData && smsData.length > 0) {
                    otps.push({
                        sender: clientName,
                        message: smsData
                    });
                }
            });
        });
        
        return { 
            status: true, 
            message: "Successfully fetched", 
            total_found: otps.length, 
            data: otps 
        };

    } catch (error) {
        console.error("Fetch Error:", error.message);
        return { 
            status: false, 
            message: "Failed to fetch data", 
            error: error.message, 
            data: [] 
        };
    }
}

// --- 🌐 API ENDPOINTS ---
app.get('/api/gaza-otps', async (req, res) => {
    try {
        if (!PANEL.user || !PANEL.pass) {
            return res.status(400).json({ status: false, message: "Bhai, pehle script mein Username/Password toh dalein!" });
        }

        const result = await fetchGazaOtps();
        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ status: false, message: "Internal Server Error", error: error.message });
    }
});

app.get('/', (req, res) => res.send('<h2>💎 GAZA IPRN API is LIVE</h2><p>Go to <a href="/api/gaza-otps">/api/gaza-otps</a></p>'));

// --- VERCEL REQUIRED EXPORT ---
module.exports = app;

// Is purane hissay ko hata dein:
// const http = require('http');
// http.createServer((req, res) => { ... }).listen(...);

// 👇 Aur iski jagah YEH NAYA CODE laga dein 👇

// --- VERCEL REQUIRED DUMMY SERVER ---
module.exports = (req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end('<h2>💎 Shahzaib Tech Bot is 100% LIVE & RUNNING!</h2>');
};
