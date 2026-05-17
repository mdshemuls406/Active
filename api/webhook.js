const axios = require('axios');

// ===== CONFIG =====
const BOT_TOKEN = process.env.BOT_TOKEN;               // Vercel env var
const TELEBOTHOST_API = process.env.TELEBOTHOST_API;   // TelebotHost REST API base URL
const TELEBOTHOST_BOT_KEY = process.env.BOT_KEY;       // TelebotHost bot key
const ADMIN_ID = "6323050876";
const OTP_GROUP = "@Active_Number_Otp";
const BOT_USERNAME = process.env.BOT_USERNAME || "Test0284749474_bot";
const CHANNEL_URL = "https://t.me/Active_Number_Update";

// TelebotHost Props API
// GET: https://api.telebothost.com/bot/{botKey}/props/{propName}
// SET: POST https://api.telebothost.com/bot/{botKey}/props/{propName}  body: {value}

async function getBotProp(key) {
    try {
        const url = `${TELEBOTHOST_API}/props/${encodeURIComponent(key)}`;
        const res = await axios.get(url, {
            headers: { "Authorization": `Bearer ${TELEBOTHOST_BOT_KEY}` },
            timeout: 5000
        });
        return res.data?.value ?? null;
    } catch (e) {
        return null;
    }
}

async function setBotProp(key, value) {
    try {
        const url = `${TELEBOTHOST_API}/props/${encodeURIComponent(key)}`;
        await axios.post(url, { value }, {
            headers: { "Authorization": `Bearer ${TELEBOTHOST_BOT_KEY}` },
            timeout: 5000
        });
    } catch (e) {}
}

async function sendTelegramMessage(chatId, text, replyMarkup = null) {
    const payload = { chat_id: chatId, text, parse_mode: "Markdown" };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, payload, { timeout: 8000 });
}

module.exports = async (req, res) => {
    // GET -> health check
    if (req.method === "GET") {
        return res.status(200).send("✅ Active Number Webhook is Online!");
    }

    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    try {
        const p = req.body || {};

        // SMSBower sends: activationId, service, text, code, country, receivedAt
        const activationId = String(p.activationId || p.id || "");
        const code = String(p.code || p.sms || "");

        if (!activationId || !code) {
            return res.status(200).send("ok");
        }

        // ─── Load order data from TelebotHost Bot Property ───
        const orderData = await getBotProp("order_" + activationId);

        if (!orderData) {
            // No order found — possibly already processed or expired
            return res.status(200).send("ok");
        }

        const userId    = String(orderData.userId);
        const price     = parseFloat(orderData.price) || 0;
        const cName     = orderData.countryName || "Unknown";
        const flag      = orderData.flag || "🌍";
        const service   = orderData.service || "Service";
        const phone     = String(orderData.phone || "");

        // ─── 1. Deduct Balance ───
        const curBal = parseFloat(await getBotProp("balance_" + userId)) || 0;
        await setBotProp("balance_" + userId, curBal - price);

        // ─── 2. Update OTP count & Total Cost ───
        const otpCount = parseInt(await getBotProp("total_otps_" + userId)) || 0;
        await setBotProp("total_otps_" + userId, otpCount + 1);

        const totalCost = parseFloat(await getBotProp("total_cost_" + userId)) || 0;
        await setBotProp("total_cost_" + userId, totalCost + price);

        // ─── 3. Clear order (prevent double processing) ───
        await setBotProp("order_" + activationId, null);

        // ─── 4. Send Full OTP to User ───
        const userMsg =
            `🌍 Country: ${flag} ${cName}\n` +
            `⚙ Service: ${service}\n` +
            `☎ Number: \`${phone}\`\n\n` +
            `🔐 Code: \`${code}\`\n\n` +
            `${code} is your ${service} code\\. Don't share it\\.`;

        await sendTelegramMessage(userId, userMsg);

        // ─── 5. Send Masked OTP to Group ───
        const masked = "*".repeat(Math.max(0, phone.length - 3)) + phone.slice(-3);
        const groupMsg =
            `🌍 Country: ${flag} ${cName}\n` +
            `⚙ Service: ${service}\n` +
            `☎ Number: ${masked}\n\n` +
            `🔐 Code: \`${code}\`\n\n` +
            `${code} is your ${service} code\\. Don't share it\\.`;

        const groupKb = {
            inline_keyboard: [[
                { text: "⚡ Get Number", url: `https://t.me/${BOT_USERNAME}` },
                { text: "📢 Join Channel", url: CHANNEL_URL }
            ]]
        };
        await sendTelegramMessage(OTP_GROUP, groupMsg, groupKb);

        return res.status(200).send("ok");

    } catch (error) {
        console.error("Webhook error:", error.message);
        // Always return 200 to SMSBower to prevent retries
        return res.status(200).send("ok");
    }
};
