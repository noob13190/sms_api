const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
app.use(express.json());

// 🛑 1. PANELS KI DETAILS
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

// ⚙️ 2. UNIVERSAL PANEL SCRAPER FUNCTION
async function fetchOtpsFromPanel(panel) {
    try {
        console.log(`⏳ Scanning ALL tables for: ${panel.name}...`);
        
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

        // --- STEP C: Fetch Stats & Scan EVERY Table ---
        const statsRes = await client.get(panel.statsUrl);
        const $stats = cheerio.load(statsRes.data);

        let otps = [];
        
        // 🧠 NAYA LOGIC: Page par maujood har <table> tag ko scan karo
        $stats('table').each((tableIndex, tableElement) => {
            
            // Har table k liye column settings reset karo
            let colIndexes = { time: 0, number: 2, sender: 3, message: -1 };
            let isTargetTable = false;

            // 1. Pehle Headers (th) check karo ke message kahan hai
            $stats(tableElement).find('thead th, tr:first-child td').each((i, el) => {
                const headerText = $stats(el).text().toLowerCase().trim();
                if (headerText.includes('date') || headerText.includes('time')) colIndexes.time = i;
                if (headerText.includes('number') || headerText.includes('client')) colIndexes.number = i;
                if (headerText.includes('sender')) colIndexes.sender = i;
                if (headerText.includes('message') || headerText.includes('text')) {
                    colIndexes.message = i;
                    isTargetTable = true;
                }
            });

            // 2. Agar header na mile, lekin table mein 10 se zyada columns hon (X-Ray Logic)
            const firstDataRow = $stats(tableElement).find('tbody tr').first().find('td');
            if (firstDataRow.length >= 10) {
                colIndexes.message = 10; // X-Ray ke mutabiq 11th column
                isTargetTable = true;
            } else if (firstDataRow.length >= 4 && !isTargetTable) {
                // Default fallback
                colIndexes.message = firstDataRow.length - 1; 
                isTargetTable = true;
            }

            // Agar yeh faltu table hai (e.g., layout table), toh aage barho
            if (!isTargetTable) return;

            // 3. Ab is specific table ki rows (tr) se data nikalo
            $stats(tableElement).find('tbody tr').each((rowIndex, rowElement) => {
                const tds = $stats(rowElement).find('td');
                
                // Empty rows ko ignore karo
                if (tds.length < 3) return; 

                const time = colIndexes.time !== -1 && tds.eq(colIndexes.time) ? tds.eq(colIndexes.time).text().trim() : "N/A";
                const number = colIndexes.number !== -1 && tds.eq(colIndexes.number) ? tds.eq(colIndexes.number).text().trim() : "N/A";
                const sender = colIndexes.sender !== -1 && tds.eq(colIndexes.sender) ? tds.eq(colIndexes.sender).text().trim() : "N/A";
                
                // Message uthao (agar column -1 hai toh last column utha lo)
                const message = colIndexes.message !== -1 ? tds.eq(colIndexes.message).text().trim() : tds.last().text().trim();

                // Sirf woh row save karo jisme waqai koi lambi OTP/Message ho
                if (message && message !== '' && message.length > 3 && message.toLowerCase() !== 'no data available in table') {
                    otps.push({ time, sender, number, message });
                }
            });
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

// Root route
app.get('/', (req, res) => res.send('<h2>💎 Shahzaib Tech Universal API is LIVE</h2><p>Go to <a href="/api/get-all-otps">/api/get-all-otps</a></p>'));

module.exports = app;
