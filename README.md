# دنیای آرش - Village AI

یک شبیه‌ساز سه‌بعدی روستایی با یک کاراکتر خودمختار به نام آرش. کلاینت با Three.js ساخته شده، سرور با Express و WebSocket وضعیت را زنده به مرورگر می‌فرستد، و تصمیم‌های آرش از طریق OpenRouter یا SambaNova گرفته می‌شود.

## ویژگی‌ها

- رندر سه‌بعدی با Three.js
- ارتباط زنده با WebSocket
- ذخیره وضعیت و خاطرات با lowdb در فایل JSON
- چرخه روز و شب، آب‌وهوا، انرژی، گرسنگی و خاطرات
- پنل Creator برای فرستادن دستورهای فوری یا زمان‌بندی‌شده
- fallback داخلی وقتی سرویس AI در دسترس نیست

## راه‌اندازی

```bash
npm install
copy .env.example .env
npm run dev
```

بعد از اجرا، برنامه روی این آدرس در دسترس است:

```text
http://localhost:3000
```

## متغیرهای محیطی

فایل `.env.example` را به `.env` کپی کنید و مقدارهای لازم را تنظیم کنید.

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
SAMBANOVA_API_KEY=your_sambanova_api_key_here
CREATOR_TOKEN=change_me_to_a_long_random_secret
DEBUG_ENABLED=false
PORT=3000
TICK_INTERVAL=5
```

برای تصمیم‌گیری AI یکی از این دو کلید کافی است: `OPENROUTER_API_KEY` یا `SAMBANOVA_API_KEY`. اگر هیچ‌کدام مقدار نداشته باشند، برنامه با fallback داخلی ادامه می‌دهد.

`CREATOR_TOKEN` در محیط production اجباری است. وقتی تنظیم شود، عملیات تغییر دستورها و مسیرهای debug فقط با هدر `X-Creator-Token` یا `Authorization: Bearer <token>` پذیرفته می‌شوند. در رابط کاربری، اگر توکن لازم باشد، مرورگر آن را می‌پرسد و در `localStorage` نگه می‌دارد.

`DEBUG_ENABLED` به طور پیش‌فرض خاموش است. برای فعال کردن مسیرهای `/api/debug/logs` و `/api/debug/test-ai` باید مقدار آن `true` باشد.

## ساختار پروژه

```text
village-ai/
  client/
    index.html
    main.js
    world.js
    character.js
    weather-fx.js
    hud.js
    creator.js
  server/
    index.js
    database.js
    gemini.js
    director.js
    scheduler.js
    weather.js
    config.js
  data/
    village.json
```

## مسیرهای اصلی API

- `GET /api/state` وضعیت فعلی، خاطرات و اطلاعات نمایشی را برمی‌گرداند.
- `GET /api/directives` برنامه پیش‌رو را برمی‌گرداند.
- `POST /api/directive` پیام Creator را پردازش می‌کند و دستور می‌سازد.
- `DELETE /api/directive/:id` یک دستور را حذف می‌کند.
- `DELETE /api/directives` همه دستورها را حذف می‌کند.
- `GET /health` وضعیت سلامت سرور را برمی‌گرداند.

## نکات امنیتی

- هیچ کلید API نباید داخل کد commit شود.
- در production حتما `CREATOR_TOKEN` را تنظیم کنید.
- مسیرهای debug را فقط موقت و در محیط امن فعال کنید.
- اگر قبلا کلید API داخل کد یا تست‌ها بوده، آن کلید را در OpenRouter باطل و یک کلید تازه بسازید.
