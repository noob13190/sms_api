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
    user: "Kanav1", // ⚠️ Yahan Username daalein
    pass: "Kanav1"  // ⚠️ Yahan Password daalein
};

// 👉 Yeh hai aapka endpoint jo 404 de raha tha
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
            const tds = $(row).find('td');
            if (tds.length >= 2 && !$(row).text().includes('No data')) {
                otps.push({
                    client: $(tds[0]).text().trim(),
                    sms_content: $(tds[1]).text().trim()
                });
            }
        });

        res.json({ status: true, total: otps.length, data: otps });

    } catch (e) {
        res.status(500).json({ status: false, error: e.message });
    }
});

module.exports = app;
