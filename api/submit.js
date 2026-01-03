import fetch from 'node-fetch';
import FormData from 'form-data';

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = '8383508734:AAGEu6EUNTJHnHC4oJG1drqseBemLZ7DPas';
const TELEGRAM_CHAT_ID = '460176717'; // Your Telegram ID

export default async function handler(req, res) {
  // Разрешаем CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;

    // Данные из формы
    const {
      telegram_username,
      discord_username,
      subscription_period,
      subscription_price,
      file,
      agreement,
      captcha,
      telegram_user_id,
      telegram_first_name,
      submitted_at
    } = data;

    // ✅ ПРОВЕРКА hCAPTCHA
    if (!captcha) {
      return res.status(400).json({ 
        success: false, 
        error: 'Капча не пройдена' 
      });
    }

    // Верифицируем hCaptcha токен
    const hcaptchaSecret = process.env.HCAPTCHA_SECRET;
    
    if (!hcaptchaSecret) {
      console.error('❌ HCAPTCHA_SECRET not configured in environment variables');
      return res.status(500).json({ 
        success: false, 
        error: 'Server configuration error. Please contact administrator.' 
      });
    }
    
    const verifyUrl = `https://hcaptcha.com/siteverify`;
    
    const hcaptchaResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${hcaptchaSecret}&response=${captcha}`
    });

    const hcaptchaData = await hcaptchaResponse.json();
    
    if (!hcaptchaData.success) {
      console.error('❌ hCaptcha verification failed:', hcaptchaData);
      return res.status(400).json({ 
        success: false, 
        error: 'Проверка капчи не удалась. Попробуйте снова.' 
      });
    }

    console.log('✅ hCaptcha verified successfully');

    console.log('Received data:', {
      telegram_username,
      discord_username,
      subscription_period,
      subscription_price,
      file: file ? 'Present' : 'Missing'
    });

    // Шаг 1: Отправляем файл и данные в Telegram
    let telegramMessageSent = false;
    
    if (file && file.data) {
      try {
        const fileBuffer = Buffer.from(file.data, 'base64');
        
        // Конвертируем время в киевский часовой пояс (UTC+2)
        const submittedDate = new Date(submitted_at);
        const kyivTime = submittedDate.toLocaleString('ru-RU', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Kiev'
        });
        
        // Формируем сообщение БЕЗ Markdown (чтобы избежать ошибок парсинга)
        const message = `💰 Новая заявка на оплату!

📱 Telegram: ${telegram_username}
🎮 Discord: ${discord_username}
📅 Период: ${subscription_period}
💵 Цена: ${subscription_price}

⏰ Дата: ${kyivTime}`;

        // Отправляем фото с подписью в Telegram
        const telegramForm = new FormData();
        telegramForm.append('chat_id', TELEGRAM_CHAT_ID);
        telegramForm.append('photo', fileBuffer, {
          filename: file.name,
          contentType: file.type
        });
        telegramForm.append('caption', message);
        // Убрали parse_mode - теперь обычный текст без Markdown

        const telegramResponse = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
          {
            method: 'POST',
            body: telegramForm,
            headers: telegramForm.getHeaders()
          }
        );

        if (telegramResponse.ok) {
          telegramMessageSent = true;
          console.log('✅ Telegram notification sent');
        } else {
          const errorText = await telegramResponse.text();
          console.error('❌ Telegram error:', errorText);
        }
      } catch (telegramError) {
        console.error('❌ Telegram send error:', telegramError);
      }
    }

    // Шаг 2: Всё готово! Tally не используется
    
    if (telegramMessageSent) {
      return res.status(200).json({ 
        success: true, 
        message: 'Payment notification sent successfully'
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to send Telegram notification'
      });
    }

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
