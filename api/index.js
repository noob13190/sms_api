const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();
app.use(express.json());

// 📅 Aaj ki date nikalne ka function (Format: YYYY-MM-DD)
function getTodayDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

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
        // 👇 Yeh raha aapka Asli API Link (Maine Date aur Length=100 set kar di hai)
        ajaxUrl: "http://85.195.94.50/sms/reseller/ajax/dt_reports.php?fdate1={TODAY}%2000:00:00&fdate2={TODAY}%2023:59:59&ftermination=&fclient=&fnum=&fcli=&fgdate=0&fgtermination=0&fgclient=0&fgnumber=0&fgcli=0&fg=0&sEcho=1&iColumns=11&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=100&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true",  
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

// ⚙️ 2. UNIVERSAL + JSON SCRAPER FUNCTION
async function fetchOtpsFromPanel(panel) {
    try {
        console.log(`⏳ Attacking: ${panel.name}...`);
        
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

        let otps = [];

        // --- STEP C: JSON FETCHING (Agar AJAX URL ho toh HTML nahi parhna) ---
        if (panel.ajaxUrl) {
            console.log(`🚀 Using Direct API Link for ${panel.name}`);
            
            // Aaj ki date URL mein daalo
            const finalAjaxUrl = panel.ajaxUrl.replace(/{TODAY}/g, getTodayDate());
            
            const statsRes = await client.get(finalAjaxUrl);
            const jsonResponse = statsRes.data;

            // DataTables aam taur par 'aaData' ya 'data' key mein array bhejta hai
            const records = jsonResponse.aaData || jsonResponse.data || [];

            records.forEach(row => {
                // Row ek array of strings hota hai
                if (row && row.length >= 4) {
                    const time = typeof row[0] === 'string' ? row[0].replace(/<[^>]*>?/gm, '').trim() : row[0];
                    const number = typeof row[2] === 'string' ? row[2].replace(/<[^>]*>?/gm, '').trim() : row[2];
                    const sender = typeof row[3] === 'string' ? row[3].replace(/<[^>]*>?/gm, '').trim() : row[3];
                    
                    // Message aakhri index par hota hai
                    let message = row[10] || row[row.length - 1];
                    message = typeof message === 'string' ? message.replace(/<[^>]*>?/gm, '').trim() : message;

                    if (message && message !== '' && !message.toString().includes('0.01')) {
                        otps.push({ time, sender, number, message });
                    }
                }
            });

        } else {
            // --- STEP C: HTML FALLBACK (Agar AJAX URL na ho) ---
            const statsRes = await client.get(panel.statsUrl);
            const $stats = cheerio.load(statsRes.data);

            $stats('table').each((tableIndex, tableElement) => {
                let colIndexes = { time: 0, number: 2, sender: 3, message: -1 };
                let isTargetTable = false;

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

                const firstDataRow = $stats(tableElement).find('tbody tr').first().find('td');
                if (firstDataRow.length >= 10) { colIndexes.message = 10; isTargetTable = true; } 
                else if (firstDataRow.length >= 4 && !isTargetTable) { colIndexes.message = firstDataRow.length - 1; isTargetTable = true; }

                if (!isTargetTable) return;

                $stats(tableElement).find('tbody tr').each((rowIndex, rowElement) => {
                    const tds = $stats(rowElement).find('td');
                    if (tds.length < 3) return; 

                    const time = colIndexes.time !== -1 ? tds.eq(colIndexes.time).text().trim() : "N/A";
                    const number = colIndexes.number !== -1 ? tds.eq(colIndexes.number).text().trim() : "N/A";
                    const sender = colIndexes.sender !== -1 ? tds.eq(colIndexes.sender).text().trim() : "N/A";
                    const message = colIndexes.message !== -1 ? tds.eq(colIndexes.message).text().trim() : tds.last().text().trim();

                    if (message && message.length > 3 && !message.toLowerCase().includes('no data')) {
                        otps.push({ time, sender, number, message });
                    }
                });
            });
        }
        
        return { panel_name: panel.name, status: true, total: otps.length, data: otps };

    } catch (error) {
        return { panel_name: panel.name, status: false, message: "Fetch Error", error: error.message, data: [] };
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
        return res.status(500).json({ status: false, message: "Master API Error", error: error.message });
    }
});

app.get('/', (req, res) => res.send('<h2>💎 Shahzaib Tech API is LIVE</h2><p>Go to <a href="/api/get-all-otps">/api/get-all-otps</a></p>'));

module.exports = app;
