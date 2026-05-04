# 🌍 دنیای آرش — Village AI

یک دنیای مجازی سه‌بعدی با یک مرد روستایی که توسط **Gemini AI** زندگی می‌کند.

## ✨ ویژگی‌ها

- 🎮 رندر سه‌بعدی با **Three.js** (مزرعه، کلبه، درخت، چاه، حصار)
- 🤖 تصمیم‌گیری هوشمند با **Gemini 1.5 Flash**
- 💾 ذخیره وضعیت مداوم در **SQLite**
- 🌐 ارتباط Real-time با **WebSocket**
- 🌦️ سیستم آب‌وهوای تصادفی (آفتابی، ابری، بارانی، مه‌آلود، طوفانی)
- 🌅 چرخه کامل روز و شب
- 📜 حافظه و خاطرات پایدار

---

## 🚀 راه‌اندازی سریع

### ۱. پیش‌نیازها
- Node.js 18+
- Gemini API Key (رایگان از [Google AI Studio](https://aistudio.google.com))

### ۲. نصب
```bash
cd village-ai
npm install
```

### ۳. تنظیم محیط
```bash
copy .env.example .env
```
فایل `.env` را باز کنید و API Key خود را وارد کنید:
```
GEMINI_API_KEY=AIza...your_key_here
```

### ۴. اجرا
```bash
npm run dev
# یا برای production:
npm start
```

مرورگر را باز کنید: **http://localhost:3000**

---

## 🧑‍🌾 مدل سه‌بعدی واقعی‌تر (اختیاری)

برای استفاده از مدل GLB واقعی به جای مدل هندسی ساده:

1. به [Mixamo.com](https://www.mixamo.com) بروید (رایگان با حساب Adobe)
2. یک کاراکتر انتخاب کنید
3. انیمیشن‌های زیر را دانلود کنید: Idle, Walking, Running
4. فایل‌ها را در `client/models/villager.glb` ذخیره کنید

---

## 🌐 استقرار — Render.com (رایگان)

### گام ۱: آپلود روی GitHub
```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOUR_USER/village-ai.git
git push -u origin main
```

### گام ۲: ساخت سرویس در Render
1. به [render.com](https://render.com) بروید
2. **New → Web Service**
3. ریپوزیتوری GitHub خود را انتخاب کنید
4. تنظیمات:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
5. در **Environment Variables** اضافه کنید:
   - `GEMINI_API_KEY` = your key

### گام ۳: جلوگیری از sleep (مهم!)
پلن رایگان Render بعد از ۱۵ دقیقه می‌خوابد. برای جلوگیری:
1. به [uptimerobot.com](https://uptimerobot.com) بروید (رایگان)
2. یک Monitor جدید بسازید
3. URL: `https://your-app.onrender.com/health`
4. هر ۵ دقیقه یکبار ping کند

---

## 🏛️ استقرار — Oracle Cloud Always Free (توصیه‌شده)

### گام ۱: ساخت VM رایگان
1. ثبت‌نام در [oracle.com/cloud/free](https://www.oracle.com/cloud/free)
2. Compute → Create Instance → **Always Free** ARM

### گام ۲: نصب Node.js روی VM
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### گام ۳: اجرا با PM2
```bash
npm install -g pm2
cd village-ai
npm install
pm2 start server/index.js --name village-ai
pm2 save && pm2 startup
```

### گام ۴: اتصال دامنه شخصی

**نصب Nginx:**
```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/village-ai
```

محتوای فایل:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/village-ai /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
```

**SSL رایگان با Let's Encrypt:**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

**DNS تنظیم دامنه:**
در پنل DNS دامنه‌تان یک **A Record** بسازید:
- Name: `@` (یا `www`)
- Value: IP عمومی سرور Oracle شما

---

## 📁 ساختار پروژه

```
village-ai/
├── server/
│   ├── index.js        # Express + WebSocket
│   ├── database.js     # SQLite wrapper
│   ├── gemini.js       # Gemini API connector
│   ├── scheduler.js    # Heartbeat (هر ۵ دقیقه)
│   └── weather.js      # آب‌وهوای تصادفی
├── client/
│   ├── index.html
│   ├── style.css
│   ├── main.js         # Three.js scene
│   ├── world.js        # مزرعه و کلبه
│   ├── character.js    # مدل و انیمیشن آرش
│   ├── weather-fx.js   # افکت‌های آب‌وهوا
│   └── hud.js          # رابط کاربری
├── data/               # پوشه SQLite (auto-created)
├── .env                # API Key
└── package.json
```

---

## 🔧 متغیرهای محیطی

| متغیر | توضیح | پیش‌فرض |
|-------|-------|---------|
| `GEMINI_API_KEY` | **اجباری** — کلید API | — |
| `PORT` | پورت سرور | `3000` |
| `TICK_INTERVAL` | فاصله تیک‌ها (دقیقه) | `5` |
