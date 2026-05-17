const axios = require('axios');

// ===== ENV VARS (Vercel Dashboard এ set করুন) =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;  // service_role key
const OTP_GROUP = process.env.OTP_GROUP || "@Active_Number_Otp";
const BOT_USERNAME = process.env.BOT_USERNAME || "YourBotUsername";
const CHANNEL_URL = "https://t.me/Active_Number_Update";

// ─── Supabase Helpers ───────────────────────────────────
const supaHeaders = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
};

async function supaGet(table, filter) {
    const res = await axios.get(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=*&limit=1`, { headers: supaHeaders });
    return res.data?.[0] ?? null;
}

async function supaUpsert(table, data) {
    await axios.post(`${SUPABASE_URL}/rest/v1/${table}`, data, {
        headers: { ...supaHeaders, "Prefer": "resolution=merge-duplicates" }
    });
}

async function supaUpdate(table, filter, data) {
    await axios.patch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, data, { headers: supaHeaders });
}

// ─── Telegram Helper ────────────────────────────────────
async function tgSend(chatId, text, replyMarkup = null, parseMode = "HTML") {
    const payload = { chat_id: chatId, text, parse_mode: parseMode };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, payload, { timeout: 8000 });
    } catch(e) {
        console.error("TG send error:", e.response?.data || e.message);
    }
}

// ─── Main Handler ───────────────────────────────────────
module.exports = async (req, res) => {
    // Health check
    if (req.method === "GET") {
        return res.status(200).send("✅ Active Number Webhook is Online!");
    }
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    try {
        const p = req.body || {};
        const activationId = String(p.activationId || p.id || "").trim();
        const code = String(p.code || p.sms || "").trim();

        if (!activationId || !code) {
            return res.status(200).send("ok");
        }

        // ─── 1. Read order from Supabase ───
        const order = await supaGet("orders", `activation_id=eq.${activationId}&processed=eq.false`);
        if (!order) {
            console.log("No order found for:", activationId);
            return res.status(200).send("ok");
        }

        const userId = String(order.user_id);
        const price = parseFloat(order.price) || 0;
        const cName = order.country_name || "Unknown";
        const flag = order.flag || "🌍";
        const service = order.service || "Service";
        const phone = String(order.phone || "");

        // ─── 2. Mark order as processed (prevent double processing) ───
        await supaUpdate("orders", `activation_id=eq.${activationId}`, { processed: true });

        // ─── 3. Update user balance & stats ───
        const userData = await supaGet("users", `user_id=eq.${userId}`);
        const curBal = parseFloat(userData?.balance) || 0;
        const curOtps = parseInt(userData?.total_otps) || 0;
        const curCost = parseFloat(userData?.total_cost) || 0;

        await supaUpsert("users", {
            user_id: userId,
            balance: curBal - price,
            total_otps: curOtps + 1,
            total_cost: curCost + price
        });

        // ─── 4. Send Full OTP to User (HTML format) ───
        const userMsg =
            `🌍 Country: ${flag} ${cName}\n` +
            `⚙ Service: ${service}\n` +
            `☎ Number: <code>${phone}</code>\n\n` +
            `🔐 Code: <code>${code}</code>\n\n` +
            `${code} is your ${service} code. Don't share it.`;

        await tgSend(userId, userMsg);

        // ─── 5. Send Masked OTP to Group with buttons (HTML format) ───
        const masked = "*".repeat(Math.max(0, phone.length - 3)) + phone.slice(-3);
        const groupMsg =
            `🌍 Country: ${flag} ${cName}\n` +
            `⚙ Service: ${service}\n` +
            `☎ Number: ${masked}\n\n` +
            `🔐 Code: <code>${code}</code>\n\n` +
            `${code} is your ${service} code. Don't share it.`;

        const groupKb = {
            inline_keyboard: [[
                { text: "⚡ Get Number", url: `https://t.me/${BOT_USERNAME}` },
                { text: "📢 Join Channel", url: CHANNEL_URL }
            ]]
        };
        await tgSend(OTP_GROUP, groupMsg, groupKb);

        return res.status(200).send("ok");

    } catch (error) {
        console.error("Webhook error:", error.response?.data || error.message);
        return res.status(200).send("ok"); // Always 200 to prevent SMSBower retries
    }
};
