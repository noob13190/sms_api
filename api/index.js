const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const app = express();

// --- 🛑 PANEL CREDENTIALS ---
const PANEL = {
    loginUrl: "http://144.217.71.192/ints/login",
    statsUrl: "http://144.217.71.192/ints/agent/SMSClientStats",
    user: "Kanav1", // ⚠️ Username yahan dalein
    pass: "Kanav1"  // ⚠️ Password yahan dalein
};

app.get('/api/gaza', async (req, res) => {
    try {
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar, timeout: 20000 }));

        // 1. Get Login Page for Captcha
        const loginPageRes = await client.get(PANEL.loginUrl);
        const $ = cheerio.load(loginPageRes.data);
        
        let captchaText = $('label:contains("=")').text() || $('div:contains("=")').text(); 
        let captchaAnswer = 0;
        
        if (captchaText) {
            const numbers = captchaText.match(/\d+/g); 
            if (numbers && numbers.length >= 2) {
                captchaAnswer = parseInt(numbers[0]) + parseInt(numbers[1]);
            }
        }
        
        const csrfToken = $('input[name="csrf_token"]').val() || '';

        // 2. Login
        const loginData = new URLSearchParams();
        loginData.append('username', PANEL.user);
        loginData.append('password', PANEL.pass);
        loginData.append('capt', captchaAnswer); 
        if (csrfToken) loginData.append('csrf_token', csrfToken); 

        await client.post(PANEL.loginUrl, loginData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // 3. Fetch Data
        const statsRes = await client.get(PANEL.statsUrl);
        const $stats = cheerio.load(statsRes.data);
        let results = [];

        $stats('table tbody tr').each((i, row) => {
            const tds = $(row).find('td');
            if (tds.length >= 2 && !$(row).text().includes('No data')) {
                results.push({
                    client: $(tds[0]).text().trim(),
                    sms: $(tds[1]).text().trim()
                });
            }
        });

        res.json({ status: true, creator: "Shahzaib Tech", total: results.length, data: results });

    } catch (error) {
        res.status(500).json({ status: false, error: error.message });
    }
});

module.exports = app;
